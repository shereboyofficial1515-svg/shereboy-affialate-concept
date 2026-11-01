// routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { requireAuth } = require('../middleware/auth');
const { validateContact, validateSubscriber } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

router.post('/message', formLimiter, validateContact, contactController.sendMessage);
router.post('/subscribe', formLimiter, validateSubscriber, contactController.subscribe);
router.get('/messages', requireAuth, contactController.listMessages);
router.get('/subscribers', requireAuth, contactController.listSubscribers);

module.exports = router;
