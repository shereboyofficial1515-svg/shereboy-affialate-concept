// routes/publicRoutes.js
// Read-only public product feed for partner sites (the SHEREBOY TECH LTD
// company website). GET only — no write routes exist here, and nothing under
// /api/public accepts credentials. Admin product management stays on the
// authenticated /api/products routes.
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

// CORS: only listed partner origins may read this feed from a browser, and
// never with cookies. (Server-to-server calls don't need CORS at all.)
const allowedOrigins = (process.env.PUBLIC_API_ALLOWED_ORIGINS || 'https://shereboytechltd.site,https://www.shereboytechltd.site')
  .split(',').map(s => s.trim()).filter(Boolean);

router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Max-Age', '600');
  }
  res.vary('Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.get('/products', publicController.listProducts);
router.get('/products/featured', publicController.featuredProducts);
router.get('/products/:slug', publicController.getProduct);
router.get('/categories', publicController.listCategories);
router.get('/status', publicController.status);

// Writes are never allowed on the public feed
router.all(['/products', '/products/*', '/categories', '/status'], (req, res) => {
  res.status(405).set('Allow', 'GET').json({ success: false, message: 'This API is read-only.' });
});

module.exports = router;
