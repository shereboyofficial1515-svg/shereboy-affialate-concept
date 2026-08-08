// routes/adminPageRoutes.js
// Serves the protected admin dashboard HTML page. The login page itself
// stays public (you obviously can't require a login to see the login form).
const express = require('express');
const router = express.Router();
const path = require('path');
const { requireAuthPage } = require('../middleware/auth');

router.get('/dashboard.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'admin', 'dashboard.html'));
});

module.exports = router;
