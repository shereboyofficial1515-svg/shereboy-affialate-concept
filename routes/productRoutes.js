// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { requireAuth } = require('../middleware/auth');
const { validateProduct } = require('../middleware/validate');
const upload = require('../middleware/upload');

// Public
router.get('/', productController.list);
router.get('/stats', requireAuth, productController.stats); // must come before /:slug-style routes below in usage
router.get('/slug/:slug', productController.getBySlug);
router.get('/:id', productController.getById);

// Admin only
router.post('/', requireAuth, upload.array('images', 8), validateProduct, productController.create);
router.put('/:id', requireAuth, upload.array('images', 8), productController.update);
router.delete('/:id', requireAuth, productController.remove);

module.exports = router;
