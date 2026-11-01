// routes/testimonialRoutes.js
const express = require('express');
const router = express.Router();
const testimonialController = require('../controllers/testimonialController');
const { requireAuth, requirePermission } = require('../middleware/auth');

const canEdit = [requireAuth, requirePermission('content.publish')];

router.param('id', (req, res, next, id) => {
  if (!/^\d{1,12}$/.test(id)) return res.status(404).json({ success: false, message: 'Not found.' });
  next();
});

router.get('/', testimonialController.list);
router.get('/all', canEdit, testimonialController.listAll);
router.post('/', canEdit, testimonialController.create);
router.put('/:id', canEdit, testimonialController.update);
router.delete('/:id', canEdit, testimonialController.remove);

module.exports = router;
