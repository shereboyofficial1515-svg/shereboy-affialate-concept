// routes/newsletterRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/newsletterController');
const { validateSubscriber } = require('../middleware/validate');

const router = express.Router();

const limiter = (max) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

const signupLimiter = limiter(Number(process.env.NEWSLETTER_RATE_LIMIT_MAX) || 10);
const tokenLimiter = limiter(Number(process.env.NEWSLETTER_TOKEN_RATE_LIMIT_MAX) || 30);

router.post('/subscribe', signupLimiter, validateSubscriber, controller.subscribe);
router.post('/confirm', tokenLimiter, controller.confirm);
router.post('/unsubscribe', tokenLimiter, controller.unsubscribe);
router.post('/one-click', tokenLimiter, controller.oneClick);
router.get('/one-click', tokenLimiter, controller.oneClickPage);

module.exports = router;
module.exports.signupLimiter = signupLimiter;
