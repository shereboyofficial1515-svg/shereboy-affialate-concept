// middleware/auth.js
// Protects admin routes using a Supabase Auth session instead of our own
// hand-rolled JWT. The access token is sent either as an httpOnly cookie
// ("sb_token") or an Authorization: Bearer header, and is verified against
// Supabase itself (supabase.auth.getUser), not a locally-signed secret.

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');

/**
 * A valid Supabase token only proves who someone is. Public sign-ups can be on in
 * a Supabase project, so an account must also be named as an administrator:
 * listed in ADMIN_EMAILS / ADMIN_EMAIL, or given app_metadata.role = "admin"
 * (which only the service role can set; users can't edit it themselves).
 * With nothing configured, nobody is an administrator.
 */
function isAdmin(user) {
  if (!user) return false;
  if (user.app_metadata?.role === 'admin') return true;
  const allowed = `${process.env.ADMIN_EMAILS || ''},${process.env.ADMIN_EMAIL || ''}`
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!user.email && allowed.includes(user.email.toLowerCase());
}

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
  if (!isAdmin(data.user)) {
    return res.status(403).json({ success: false, message: 'This account is not an administrator.' });
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
  if (error || !data?.user || !isAdmin(data.user)) return res.redirect('/admin/login.html');

  req.user = data.user;
  req.token = token;
  next();
});

module.exports = { requireAuth, requireAuthPage, isAdmin };
