// controllers/mediaController.js
const sharp = require('sharp');
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const media = require('../services/mediaService');
const { audit } = require('../services/audit');
const { clientError } = media;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const COLUMNS = 'id, filename, kind, mime_type, url, thumb_url, size_bytes, width, height, folder_id, category, alt_text, title, description, uploaded_by, created_at, updated_at';

function throwIf(error, what) {
  if (error) throw new Error(`Failed to ${what}: ${error.message}`);
}

async function findMedia(id) {
  const { data, error } = await supabaseAdmin.from('media').select('*').eq('id', id).maybeSingle();
  throwIf(error, 'load media');
  if (!data) throw clientError('File not found.', 404);
  return data;
}

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(Math.max(1, Number(req.query.perPage) || 40), 100);
  let query = supabaseAdmin.from('media').select(COLUMNS, { count: 'exact' }).order('created_at', { ascending: false });

  const q = text(req.query.q, 100);
  if (q) query = query.ilike('filename', `%${q.replace(/[%_\\]/g, '\\$&')}%`);
  if (['image', 'video', 'document'].includes(req.query.kind)) query = query.eq('kind', req.query.kind);
  if (/^\d{1,12}$/.test(req.query.folder || '')) query = query.eq('folder_id', req.query.folder);
  if (text(req.query.category, 60)) query = query.eq('category', text(req.query.category, 60));
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) query = query.gte('created_at', `${req.query.from}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) query = query.lte('created_at', `${req.query.to}T23:59:59Z`);

  const from = (page - 1) * perPage;
  const { data, error, count } = await query.range(from, from + perPage - 1);
  throwIf(error, 'list media');
  res.json({ success: true, items: data || [], total: count || 0, page, totalPages: Math.max(1, Math.ceil((count || 0) / perPage)) });
});

exports.upload = asyncHandler(async (req, res) => {
  if (!req.file) throw clientError('Choose a file to upload.');
  const stored = await media.storeFile(req.file);
  const folderId = /^\d{1,12}$/.test(req.body.folder_id || '') ? Number(req.body.folder_id) : null;
  const filename = media.cleanFilename(req.file.originalname);
  const { data, error } = await supabaseAdmin.from('media').insert({
    ...stored,
    filename,
    folder_id: folderId,
    category: text(req.body.category, 60) || null,
    alt_text: text(req.body.alt_text, 300) || null,
    title: text(req.body.title, 200) || null,
    uploaded_by: req.user.email
  }).select(COLUMNS).single();
  if (error) {
    await media.removeFiles(stored.storage_paths); // don't leave an orphan behind
    throw new Error(`Failed to save media: ${error.message}`);
  }
  res.status(201).json({ success: true, message: 'Uploaded.', item: data });
});

exports.update = asyncHandler(async (req, res) => {
  await findMedia(req.params.id);
  const fields = { updated_at: new Date().toISOString() };
  if (req.body.filename !== undefined) {
    const name = media.cleanFilename(req.body.filename);
    if (!String(req.body.filename).trim()) throw clientError('A file needs a name.');
    fields.filename = name;
  }
  for (const [key, max] of [['alt_text', 300], ['title', 200], ['description', 2000], ['category', 60]]) {
    if (req.body[key] !== undefined) fields[key] = text(req.body[key], max) || null;
  }
  if (req.body.folder_id !== undefined) {
    if (req.body.folder_id !== null && !Number.isInteger(req.body.folder_id)) throw clientError('Invalid folder.');
    fields.folder_id = req.body.folder_id;
  }
  const { data, error } = await supabaseAdmin.from('media').update(fields).eq('id', req.params.id).select(COLUMNS).single();
  throwIf(error, 'save media');
  res.json({ success: true, message: 'Saved. The file’s web address stays the same.', item: data });
});

exports.usage = asyncHandler(async (req, res) => {
  const item = await findMedia(req.params.id);
  res.json({ success: true, usage: await media.findUsage(item.url) });
});

// Files in use aren't deleted without an explicit confirmation of what will break
exports.remove = asyncHandler(async (req, res) => {
  const item = await findMedia(req.params.id);
  const usage = await media.findUsage(item.url);
  if (usage.length && req.query.force !== 'true') {
    return res.status(409).json({ success: false, inUse: true, usage, message: `This file is used in ${usage.length} place${usage.length === 1 ? '' : 's'}. Deleting it will break them.` });
  }
  const { error } = await supabaseAdmin.from('media').delete().eq('id', item.id);
  throwIf(error, 'delete media');
  await media.removeFiles(item.storage_paths);
  await audit(req, 'media.delete', { type: 'media', id: item.id, details: { filename: item.filename, wasInUse: usage.length } });
  res.json({ success: true, message: 'File deleted.' });
});

// Brings images that products already use into the library, so they can be reused
exports.importExisting = asyncHandler(async (req, res) => {
  const { data: products, error } = await supabaseAdmin.from('products').select('name, images');
  throwIf(error, 'read products');
  const { data: known, error: knownError } = await supabaseAdmin.from('media').select('url');
  throwIf(knownError, 'read media');
  const seen = new Set((known || []).map((m) => m.url));

  let imported = 0, failed = 0;
  for (const product of products || []) {
    for (const url of Array.isArray(product.images) ? product.images : []) {
      if (typeof url !== 'string' || !url.startsWith('https://') || seen.has(url)) continue;
      seen.add(url);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        const meta = await sharp(buffer).metadata();
        const objectPath = (url.match(/\/product-images\/([^?]+)/) || [])[1];
        const optimized = /\/opt-[^/]+\.webp$/.test(url);
        const paths = objectPath ? [objectPath, ...(optimized ? [objectPath.replace(/\.webp$/, '-w480.webp'), objectPath.replace(/\.webp$/, '-w480.jpg')] : [])] : [];
        const { error: insertError } = await supabaseAdmin.from('media').insert({
          filename: `${media.cleanFilename(String(product.name).trim()).slice(0, 150)}.${meta.format}`,
          kind: 'image',
          mime_type: `image/${meta.format}`,
          url,
          thumb_url: optimized ? url.replace(/\.webp$/, '-w480.webp') : url,
          storage_paths: paths,
          size_bytes: buffer.length,
          width: meta.width,
          height: meta.height,
          category: 'Products',
          alt_text: String(product.name).trim().slice(0, 300),
          uploaded_by: req.user.email
        });
        if (insertError) throw new Error(insertError.message);
        imported++;
      } catch (err) {
        console.warn('[media] could not import', url, err.message);
        failed++;
      }
    }
  }
  res.json({ success: true, imported, failed, message: `Imported ${imported} image${imported === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.` });
});

// ---------- Folders ----------
exports.listFolders = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('media_folders').select('id, name').order('name');
  throwIf(error, 'list folders');
  res.json({ success: true, folders: data || [] });
});

function folderName(body) {
  const name = text(body.name, 80);
  if (!name) throw clientError('A folder needs a name.');
  return name;
}

exports.createFolder = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('media_folders').insert({ name: folderName(req.body) }).select('id, name').single();
  if (error && error.code === '23505') throw clientError('A folder with that name already exists.', 409);
  throwIf(error, 'create folder');
  res.status(201).json({ success: true, folder: data });
});

exports.renameFolder = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('media_folders').update({ name: folderName(req.body) }).eq('id', req.params.id).select('id, name').maybeSingle();
  if (error && error.code === '23505') throw clientError('A folder with that name already exists.', 409);
  throwIf(error, 'rename folder');
  if (!data) throw clientError('Folder not found.', 404);
  res.json({ success: true, folder: data });
});

// Files inside aren't deleted: they just move out of the folder
exports.deleteFolder = asyncHandler(async (req, res) => {
  const { error: moveError } = await supabaseAdmin.from('media').update({ folder_id: null }).eq('folder_id', req.params.id);
  throwIf(moveError, 'move files out of the folder');
  const { error } = await supabaseAdmin.from('media_folders').delete().eq('id', req.params.id);
  throwIf(error, 'delete folder');
  res.json({ success: true, message: 'Folder deleted. Its files are kept.' });
});
