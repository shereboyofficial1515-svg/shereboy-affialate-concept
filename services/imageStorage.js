// services/imageStorage.js
// Product images are stored in Supabase Storage (a public bucket) instead of
// the server's local disk. Hosts like Render wipe local files on every
// deploy/restart, which silently broke every "/uploads/..." product image.
// Storage URLs are permanent, public https links that work on this site and
// on partner sites (e.g. the SHEREBOY TECH LTD website).
//
// Older products may still reference "/uploads/<file>" paths. Those are only
// advertised while the file exists on disk (see usableImages).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { supabaseAdmin } = require('../config/supabase');

// The host has little memory: decode one image at a time and don't keep a cache
sharp.concurrency(1);
sharp.cache(false);

const BUCKET = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'product-images';
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAIN_WIDTH = 1200;
const THUMB_WIDTH = 480;

// Declared MIME type must match the file's real signature (blocks renamed files)
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  'image/gif': (b) => /^GIF8[79]a$/.test(b.slice(0, 6).toString('latin1'))
};

function rejected() {
  const err = new Error('Only JPG, PNG, WEBP, and GIF images are allowed.');
  err.status = 400;
  return err;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Could not create the "${BUCKET}" storage bucket: ${error.message}`);
    }
  }
  bucketReady = true;
}

async function uploadObject(objectPath, buffer, contentType) {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType,
    cacheControl: '31536000', // names are random, so a file's content never changes
    upsert: false
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
}

/** Stores all three copies of an image and describes what was saved. */
async function optimizeImage(buffer) {
  let main, thumb, emailCopy, meta;
  try {
    const source = sharp(buffer, { failOn: 'error' }).rotate();
    main = await source.clone().resize({ width: MAIN_WIDTH, height: MAIN_WIDTH, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    thumb = await source.clone().resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    emailCopy = await source.clone().resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
    meta = await sharp(main).metadata();
  } catch {
    throw rejected(); // right signature, but not a readable image
  }
  await ensureBucket();
  const name = `products/opt-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const paths = [`${name}.webp`, `${name}-w${THUMB_WIDTH}.webp`, `${name}-w${THUMB_WIDTH}.jpg`];
  await uploadObject(paths[0], main, 'image/webp');
  await uploadObject(paths[1], thumb, 'image/webp');
  await uploadObject(paths[2], emailCopy, 'image/jpeg');
  const urlOf = (p) => supabaseAdmin.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
  return { url: urlOf(paths[0]), thumbUrl: urlOf(paths[1]), paths, size: main.length, width: meta.width, height: meta.height };
}

/**
 * Saves one image as WebP at two sizes and returns the main image's public URL.
 * Copies live next to it: "<name>-w480.webp" for phones (see the srcset in
 * public/js/render.js) and "<name>-w480.jpg" for email, because classic Outlook
 * can't display WebP. All three are removed together by deleteImages.
 */
async function storeImageBuffer(buffer) {
  return (await optimizeImage(buffer)).url;
}

/** Uploads multer memory files and returns their permanent public URLs. */
async function storeImages(files = []) {
  if (!files.length) return [];
  for (const f of files) {
    const matches = SIGNATURES[f.mimetype];
    if (!matches || !matches(f.buffer)) throw rejected();
  }
  const urls = [];
  for (const f of files) urls.push(await storeImageBuffer(f.buffer));
  return urls;
}

/** Deletes images that belong to this site (storage objects or legacy local files). Best-effort. */
async function deleteImages(urls = []) {
  // Files in the media library can be shared, so only the library may remove them
  const candidates = urls.filter((u) => typeof u === 'string');
  if (candidates.length) {
    const { data, error } = await supabaseAdmin.from('media').select('url').in('url', candidates);
    if (error) {
      console.warn('[imageStorage] kept images, could not check the media library:', error.message);
      return;
    }
    const shared = new Set((data || []).map((m) => m.url));
    urls = candidates.filter((u) => !shared.has(u));
  }
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const objectPaths = [];
  for (const url of urls) {
    if (typeof url !== 'string') continue;
    if (url.includes(marker)) {
      const objectPath = decodeURIComponent(url.split(marker)[1].split('?')[0]);
      objectPaths.push(objectPath);
      if (/\/opt-[^/]+\.webp$/.test(objectPath)) {
        objectPaths.push(objectPath.replace(/\.webp$/, `-w${THUMB_WIDTH}.webp`), objectPath.replace(/\.webp$/, `-w${THUMB_WIDTH}.jpg`));
      }
    } else if (/^\/uploads\/[\w.-]+$/.test(url)) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
    }
  }
  if (objectPaths.length) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(objectPaths);
    if (error) console.warn('[imageStorage] could not delete images:', error.message);
  }
}

/** True when a legacy "/uploads/<file>" path still exists on this server's disk. */
function localUploadExists(url) {
  if (!/^\/uploads\/[\w.-]+$/.test(url)) return false;
  return fs.existsSync(path.join(UPLOAD_DIR, path.basename(url)));
}

/**
 * The images a browser can actually load: https URLs, plus legacy uploads whose
 * file is still on disk. Dead paths and http:// links (blocked as mixed content
 * on an https page) are dropped here so the site never requests them.
 */
function usableImages(images) {
  return (Array.isArray(images) ? images : []).filter((raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return false;
    const value = raw.trim();
    if (value.startsWith('/uploads/')) return localUploadExists(value);
    if (process.env.PREVIEW_IMAGE_BASE && value.startsWith(process.env.PREVIEW_IMAGE_BASE)) return true; // local preview only
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  });
}

module.exports = { storeImages, storeImageBuffer, optimizeImage, ensureBucket, deleteImages, localUploadExists, usableImages, BUCKET, THUMB_WIDTH };
