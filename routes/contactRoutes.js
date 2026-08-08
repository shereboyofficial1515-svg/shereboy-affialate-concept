// routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { requireAuth } = require('../middleware/auth');
const { validateContact, validateSubscriber } = require('../middleware/validate');

router.post('/message', validateContact, contactController.sendMessage);
router.post('/subscribe', validateSubscriber, contactController.subscribe);
router.get('/messages', requireAuth, contactController.listMessages);
router.get('/subscribers', requireAuth, contactController.listSubscribers);

module.exports = router;
