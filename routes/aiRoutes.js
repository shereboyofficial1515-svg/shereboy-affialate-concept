// routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const rateLimit = require('express-rate-limit');

// The AI endpoint calls an external paid API, so it gets its own tighter limiter.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: 'You are sending messages too quickly. Please slow down.' }
});

router.post('/chat', aiLimiter, aiController.chat);

module.exports = router;
