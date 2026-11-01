// services/imageStorage.js
// Product images are stored in Supabase Storage (a public bucket) instead of
// the server's local disk. Hosts like Render wipe local files on every
// deploy/restart, which silently broke every "/uploads/..." product image.
// Storage URLs are permanent, public https links that work on this site and
// on partner sites (e.g. the SHEREBOY TECH LTD website).
//
// Older products may still reference "/uploads/<file>" paths; those keep
// working while the file exists on disk (see publicController for how
// missing files are reported).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase');

const BUCKET = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'product-images';
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

// Declared MIME type must match the file's real signature (blocks renamed files)
const SIGNATURES = {
  'image/jpeg': { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  'image/gif': { ext: 'gif', test: (b) => /^GIF8[79]a$/.test(b.slice(0, 6).toString('latin1')) }
};

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

/** Uploads multer memory files and returns their permanent public URLs. */
async function storeImages(files = []) {
  if (!files.length) return [];
  for (const f of files) {
    const sig = SIGNATURES[f.mimetype];
    if (!sig || !sig.test(f.buffer)) {
      const err = new Error('Only JPG, PNG, WEBP, and GIF images are allowed.');
      err.status = 400;
      throw err;
    }
  }
  await ensureBucket();
  const urls = [];
  for (const f of files) {
    const objectPath = `products/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${SIGNATURES[f.mimetype].ext}`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, f.buffer, {
      contentType: f.mimetype,
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    urls.push(supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl);
  }
  return urls;
}

/** Deletes images that belong to this site (storage objects or legacy local files). Best-effort. */
async function deleteImages(urls = []) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const objectPaths = [];
  for (const url of urls) {
    if (typeof url !== 'string') continue;
    if (url.includes(marker)) {
      objectPaths.push(decodeURIComponent(url.split(marker)[1].split('?')[0]));
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

module.exports = { storeImages, deleteImages, localUploadExists, BUCKET };
