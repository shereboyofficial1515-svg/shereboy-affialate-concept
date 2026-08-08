// server.js
// Entry point for SHEREBOY AFFILIATE CONCEPT.
// Wires up security middleware, static file serving, and API routes.
// Data lives in Supabase (Postgres) — see database/schema.sql for the
// migration to run once in your Supabase project before starting this.

require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');

// Just importing this validates that SUPABASE_URL/keys are present (it
// logs a warning if not) and creates the shared clients used everywhere
// else in the app.
require('./config/supabase');

const app = express();

// ---------- Security & performance middleware ----------
app.use(helmet({
  contentSecurityPolicy: false // relaxed here since this is a static-frontend + API app; tighten before production
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(xss());

// Global rate limiter — protects every route from abuse.
const globalLimiter = rateLimit({
  windowMs: (Number(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' }
});
app.use(globalLimiter);

// ---------- API routes ----------
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/testimonials', require('./routes/testimonialRoutes'));

// ---------- Protected admin PAGE (checked before static serving) ----------
app.use('/admin', require('./routes/adminPageRoutes'));

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin'))); // admin login page + admin-only JS/CSS

// Friendly root fallback
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- 404 handler ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ---------- Central error handler ----------
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  if (err.message && err.message.includes('Only JPG')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 SHEREBOY AFFILIATE CONCEPT running at http://localhost:${PORT}`);
  console.log(`   Admin login: http://localhost:${PORT}/admin/login.html\n`);
});

module.exports = app;
