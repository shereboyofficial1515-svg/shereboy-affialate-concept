// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { requireAuth } = require('../middleware/auth');

// Ids are numbers; anything else is simply not found
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,12}$/.test(id)) return res.status(404).json({ success: false, message: 'Not found.' });
  next();
});

router.get('/', categoryController.list);
router.post('/', requireAuth, categoryController.create);
router.put('/:id', requireAuth, categoryController.update);
router.delete('/:id', requireAuth, categoryController.remove);

module.exports = router;
