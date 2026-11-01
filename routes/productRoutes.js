// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { validateProduct } = require('../middleware/validate');
const upload = require('../middleware/upload');
const rateLimit = require('express-rate-limit');

const clickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests.' }
});

// Ids are numbers; anything else is simply not found
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,12}$/.test(id)) return res.status(404).json({ success: false, message: 'Not found.' });
  next();
});

// Public
router.get('/', productController.list);
router.get('/stats', requireAuth, productController.stats); // must come before /:slug-style routes below in usage
router.get('/slug/:slug', productController.getBySlug);
router.get('/:id', productController.getById);
router.post('/:id/click', clickLimiter, productController.recordClick);

// Admin only
router.post('/', requireAuth, requirePermission('products.publish'), upload.array('images', 8), validateProduct, productController.create);
router.put('/:id', requireAuth, requirePermission('products.publish'), upload.array('images', 8), validateProduct, productController.update);
router.delete('/:id', requireAuth, requirePermission('products.publish'), productController.remove);

module.exports = router;
