// routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const newsletterController = require('../controllers/newsletterController');
const { signupLimiter } = require('./newsletterRoutes');
const { requireAuth, requirePermission } = require('../middleware/auth');
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
// Older path for the same signup, kept for pages still open or cached in browsers
router.post('/subscribe', signupLimiter, validateSubscriber, newsletterController.subscribe);
router.get('/messages', requireAuth, requirePermission('email.manage'), contactController.listMessages);

module.exports = router;
