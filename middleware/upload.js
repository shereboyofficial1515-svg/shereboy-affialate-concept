// middleware/upload.js
// Handles product image uploads securely:
//  - only image mime types are accepted (re-checked against the file's real
//    signature in services/imageStorage.js before anything is stored)
//  - files are held in memory and then saved to Supabase Storage with random
//    names (no user-controlled filenames) — never to the server's local disk,
//    which hosting platforms wipe on every deploy/restart
//  - a size cap prevents abuse

const multer = require('multer');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, WEBP, and GIF images are allowed.'));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 } // 5MB per file, up to 8 images
});

module.exports = upload;
