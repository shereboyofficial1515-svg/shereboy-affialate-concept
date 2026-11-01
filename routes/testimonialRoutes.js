// routes/testimonialRoutes.js
const express = require('express');
const router = express.Router();
const testimonialController = require('../controllers/testimonialController');
const { requireAuth } = require('../middleware/auth');

router.param('id', (req, res, next, id) => {
  if (!/^\d{1,12}$/.test(id)) return res.status(404).json({ success: false, message: 'Not found.' });
  next();
});

router.get('/', testimonialController.list);
router.get('/all', requireAuth, testimonialController.listAll);
router.post('/', requireAuth, testimonialController.create);
router.put('/:id', requireAuth, testimonialController.update);
router.delete('/:id', requireAuth, testimonialController.remove);

module.exports = router;
