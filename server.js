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

const { useClientIp } = require('./utils/clientIp');

const app = express();

// Without this, every visitor behind Render's proxy shared one address, so a
// single visitor could use up the rate limits for everyone
app.set('trust proxy', 1);
app.use(useClientIp);

// ---------- Security & performance middleware ----------
// Only the listed sites may show this website in a frame (the SHEREBOY TECH LTD
// project preview). frame-ancestors replaces the older X-Frame-Options header.
// Scripts only run from this site's own files, so injected markup can't execute.
const frameAncestors = (process.env.FRAME_ANCESTORS || 'https://shereboytechltd.site,https://www.shereboytechltd.site')
  .split(',').map(s => s.trim()).filter(s => /^https?:\/\/[\w.:-]+$/.test(s));
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use((req, res, next) => {
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors 'self' ${frameAncestors.join(' ')}`
  ].join('; '));
  next();
});
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
// Readiness for the SHEREBOY TECH LTD service monitor: answers only once the app can
// reach its database. Before the rate limiter so that monitoring can't exhaust it.
app.get('/api/health', async (req, res) => {
  const { supabaseAdmin } = require('./config/supabase');
  res.set('Cache-Control', 'no-store');
  try {
    const { error } = await Promise.race([
      supabaseAdmin.from('products').select('id', { head: true }).limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);
    if (error) throw error;
    res.json({ success: true, ready: true, service: 'SHEREBOY AFFILIATE CONCEPT', database: 'ok' });
  } catch {
    res.status(503).json({ success: false, ready: false, service: 'SHEREBOY AFFILIATE CONCEPT', database: 'unavailable' });
  }
});

app.use(globalLimiter);

// ---------- API routes ----------
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/testimonials', require('./routes/testimonialRoutes'));
// Read-only public product feed for partner sites (SHEREBOY TECH LTD website)
app.use('/api/public', require('./routes/publicRoutes'));

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
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 5MB or smaller.' : 'That upload could not be accepted.' });
  }
  // Expected client errors (bad query parameters, rejected uploads) aren't server faults
  const clientError = (err.status && err.status < 500) || (err.message && err.message.includes('Only JPG'));
  if (!clientError) console.error(err.stack || err.message);
  if (err.message && err.message.includes('Only JPG')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(err.status || 500).json({
    success: false,
    // err.expose marks messages written for the client (e.g. validation errors)
    message: err.expose || process.env.NODE_ENV !== 'production' ? err.message : 'Something went wrong.'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nSHEREBOY AFFILIATE CONCEPT running at http://localhost:${PORT}`);
  console.log(`   Admin login: http://localhost:${PORT}/admin/login.html\n`);
});

module.exports = app;
