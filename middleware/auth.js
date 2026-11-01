// middleware/auth.js
// Protects admin routes using a Supabase Auth session instead of our own
// hand-rolled JWT. The access token is sent either as an httpOnly cookie
// ("sb_token") or an Authorization: Bearer header, and is verified against
// Supabase itself (supabase.auth.getUser), not a locally-signed secret.
//
// A valid token only proves who someone is. Public sign-ups can be on in a
// Supabase project, so an account also needs a role:
//   owner   named in ADMIN_EMAILS / ADMIN_EMAIL, or app_metadata.role = "admin"
//           (which only the service role can set; users can't edit it themselves)
//   admin / editor   assigned by an owner in Admin Users (admin_roles table)
// With nothing configured, nobody has a role.

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');

const EDITOR = ['products.edit', 'media.manage', 'ai.use', 'content.edit'];
const ADMIN = [...EDITOR, 'products.publish', 'content.publish', 'email.manage', 'settings.manage', 'ai.manage', 'audit.view', 'system.view'];
const OWNER = [...ADMIN, 'ai.keys', 'users.manage'];
const ROLE_PERMISSIONS = { owner: OWNER, admin: ADMIN, editor: EDITOR };

function isOwner(user) {
  if (!user) return false;
  if (user.app_metadata?.role === 'admin') return true;
  const allowed = `${process.env.ADMIN_EMAILS || ''},${process.env.ADMIN_EMAIL || ''}`
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!user.email && allowed.includes(user.email.toLowerCase());
}

/** The account's role, or null if it has no access to the dashboard. */
async function roleFor(user) {
  if (!user) return null;
  if (isOwner(user)) return 'owner';
  if (!user.email) return null;
  const { data, error } = await supabaseAdmin.from('admin_roles').select('role').eq('email', user.email.toLowerCase()).maybeSingle();
  if (error) return null; // never grant access because a lookup failed
  return data && ROLE_PERMISSIONS[data.role] ? data.role : null;
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
  const role = await roleFor(data.user);
  if (!role) {
    return res.status(403).json({ success: false, message: 'This account is not an administrator.' });
  }

  req.user = data.user;
  req.token = token;
  req.role = role;
  req.permissions = ROLE_PERMISSIONS[role];
  next();
});

/** Use after requireAuth. Each sensitive route names the permission it needs. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.permissions && req.permissions.includes(permission)) return next();
    res.status(403).json({ success: false, message: "Your role doesn't allow this." });
  };
}

// For pages (not JSON APIs): redirect to the login page instead of
// returning a JSON 401, since a browser is navigating directly.
const requireAuthPage = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.redirect('/admin/login.html');

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const role = !error && data?.user ? await roleFor(data.user) : null;
  if (!role) return res.redirect('/admin/login.html');

  req.user = data.user;
  req.token = token;
  req.role = role;
  req.permissions = ROLE_PERMISSIONS[role];
  next();
});

module.exports = { requireAuth, requireAuthPage, requirePermission, roleFor, ROLE_PERMISSIONS };
