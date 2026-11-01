// services/mediaService.js
// The media library. Files live in the public Supabase Storage bucket, so URLs
// survive deploys and restarts; the media table holds what we know about them.
// Every file is checked against its real contents, not just its stated type.

const crypto = require('crypto');
const sharp = require('sharp');
const { supabaseAdmin } = require('../config/supabase');
const { BUCKET, ensureBucket, optimizeImage, THUMB_WIDTH } = require('./imageStorage');
const { cleanSvg } = require('./richText');

const MB = 1024 * 1024;
const TYPES = {
  'image/jpeg': { kind: 'image', max: 10 * MB, test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { kind: 'image', max: 10 * MB, test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { kind: 'image', max: 10 * MB, test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  'image/gif': { kind: 'image', max: 10 * MB, test: (b) => /^GIF8[79]a$/.test(b.slice(0, 6).toString('latin1')) },
  'image/svg+xml': { kind: 'image', max: 2 * MB, test: (b) => /<svg[\s>]/i.test(b.slice(0, 4096).toString('utf8')) },
  'video/mp4': { kind: 'video', ext: 'mp4', max: 50 * MB, test: (b) => b.slice(4, 8).toString('latin1') === 'ftyp' },
  'video/webm': { kind: 'video', ext: 'webm', max: 50 * MB, test: (b) => b.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  'application/pdf': { kind: 'document', ext: 'pdf', max: 20 * MB, test: (b) => b.slice(0, 5).toString('latin1') === '%PDF-' }
};
const MAX_UPLOAD = 50 * MB;

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

async function put(objectPath, buffer, contentType) {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, buffer, { contentType, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}
const publicUrl = (objectPath) => supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;

/** Names are only for display and search: the stored object has a random name. */
function cleanFilename(name) {
  const clean = String(name || 'file').replace(/[\\/]/g, '-').replace(/[\u0000-\u001f<>"']/g, '').trim().slice(0, 200);
  return clean || 'file';
}

/** Validates and stores one upload. Returns the columns for the media row. */
async function storeFile(file) {
  const type = TYPES[file.mimetype];
  if (!type || !type.test(file.buffer)) {
    throw clientError(`"${cleanFilename(file.originalname)}" isn't an allowed file. Use JPG, PNG, WEBP, GIF, SVG, MP4, WEBM or PDF.`);
  }
  if (file.buffer.length > type.max) {
    throw clientError(`"${cleanFilename(file.originalname)}" is too large. The limit for this type is ${type.max / MB} MB.`);
  }

  await ensureBucket();
  const base = `library/${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  if (file.mimetype === 'image/svg+xml') {
    const clean = cleanSvg(file.buffer.toString('utf8'));
    if (!clean) throw clientError('That SVG file could not be made safe, so it was refused.');
    const buffer = Buffer.from(clean);
    const meta = await sharp(buffer).metadata().catch(() => ({}));
    const path = `${base}.svg`;
    await put(path, buffer, 'image/svg+xml');
    return { kind: 'image', mime_type: 'image/svg+xml', url: publicUrl(path), thumb_url: publicUrl(path), storage_paths: [path], size_bytes: buffer.length, width: meta.width || null, height: meta.height || null };
  }

  if (file.mimetype === 'image/gif') {
    // Kept as-is so animation survives; the thumbnail is the first frame
    let meta, thumb;
    try {
      meta = await sharp(file.buffer).metadata();
      thumb = await sharp(file.buffer).resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    } catch {
      throw clientError(`"${cleanFilename(file.originalname)}" isn't a readable image.`);
    }
    const paths = [`${base}.gif`, `${base}-thumb.webp`];
    await put(paths[0], file.buffer, 'image/gif');
    await put(paths[1], thumb, 'image/webp');
    return { kind: 'image', mime_type: 'image/gif', url: publicUrl(paths[0]), thumb_url: publicUrl(paths[1]), storage_paths: paths, size_bytes: file.buffer.length, width: meta.width, height: meta.height };
  }

  if (type.kind === 'image') {
    const stored = await optimizeImage(file.buffer);
    return { kind: 'image', mime_type: 'image/webp', url: stored.url, thumb_url: stored.thumbUrl, storage_paths: stored.paths, size_bytes: stored.size, width: stored.width, height: stored.height };
  }

  const path = `${base}.${type.ext}`;
  await put(path, file.buffer, file.mimetype);
  return { kind: type.kind, mime_type: file.mimetype, url: publicUrl(path), thumb_url: null, storage_paths: [path], size_bytes: file.buffer.length, width: null, height: null };
}

async function removeFiles(paths) {
  if (!paths || !paths.length) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
  if (error) console.warn('[media] could not delete files:', error.message);
}

const stringifies = (value, url) => typeof value === 'string' ? value.includes(url) : JSON.stringify(value ?? '').includes(url);

/** Everywhere a file's URL appears. Deleting one in use would break those places. */
async function findUsage(url) {
  const used = [];
  const read = async (table, columns) => {
    const { data, error } = await supabaseAdmin.from(table).select(columns);
    if (error) throw new Error(`Couldn't check where this file is used: ${error.message}`);
    return data || [];
  };
  const [products, categories, banners, settings, pages, campaigns] = await Promise.all([
    read('products', 'id, name, images, draft, description'),
    read('categories', 'id, name, image_url'),
    read('banners', 'id, title, image_url'),
    read('site_settings', 'key, value'),
    read('pages', 'slug, title, draft_html, published_html'),
    read('email_campaigns', 'id, subject, body, status')
  ]);
  products.forEach((p) => {
    if (stringifies(p.images, url) || stringifies(p.draft, url) || stringifies(p.description, url)) used.push({ type: 'Product', name: String(p.name).trim(), id: p.id });
  });
  categories.forEach((c) => { if (c.image_url === url) used.push({ type: 'Category', name: c.name, id: c.id }); });
  banners.forEach((b) => { if (b.image_url === url) used.push({ type: 'Banner', name: b.title, id: b.id }); });
  settings.forEach((s) => { if (stringifies(s.value, url)) used.push({ type: 'Settings', name: s.key, id: s.key }); });
  pages.forEach((p) => { if (stringifies(p.draft_html, url) || stringifies(p.published_html, url)) used.push({ type: 'Page', name: p.title, id: p.slug }); });
  campaigns.forEach((c) => { if (stringifies(c.body, url)) used.push({ type: 'Campaign', name: c.subject, id: c.id }); });
  return used;
}

module.exports = { storeFile, removeFiles, findUsage, cleanFilename, clientError, MAX_UPLOAD };
