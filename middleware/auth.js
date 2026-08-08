// middleware/auth.js
// Protects admin routes using a Supabase Auth session instead of our own
// hand-rolled JWT. The access token is sent either as an httpOnly cookie
// ("sb_token") or an Authorization: Bearer header, and is verified against
// Supabase itself (supabase.auth.getUser), not a locally-signed secret.

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');

function extractToken(req) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  return req.cookies?.sb_token || bearer;
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again.' });
  }

  req.user = data.user;
  req.token = token;
  next();
});

// For pages (not JSON APIs): redirect to the login page instead of
// returning a JSON 401, since a browser is navigating directly.
const requireAuthPage = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.redirect('/admin/login.html');

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.redirect('/admin/login.html');

  req.user = data.user;
  req.token = token;
  next();
});

module.exports = { requireAuth, requireAuthPage };
