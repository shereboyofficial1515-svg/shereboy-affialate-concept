// controllers/authController.js
// Admin authentication is now handled entirely by Supabase Auth — there's
// no local password hashing or JWT-signing here anymore. Supabase issues
// and verifies the session token; we just store it in an httpOnly cookie
// so the dashboard stays logged in between requests.

const { supabase, supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');

const isProd = () => process.env.NODE_ENV === 'production';

function shapeUser(user) {
  return {
    id: user.id,
    name: user.user_metadata?.name || user.email,
    email: user.email,
    role: 'admin', // every account able to sign in here is an admin by design
    created_at: user.created_at
  };
}

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const { access_token, expires_in } = data.session;

  res.cookie('sb_token', access_token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'strict',
    maxAge: (expires_in || 3600) * 1000
  });

  res.json({
    success: true,
    message: 'Logged in successfully.',
    token: access_token, // also returned for clients that prefer Authorization headers
    user: shapeUser(data.user)
  });
});

exports.logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.sb_token;
  if (token) {
    // Best-effort: revoke the session on Supabase's side too, not just
    // locally. Ignored on failure so logout never gets stuck for the user.
    try { await supabaseAdmin.auth.admin.signOut(token); } catch (e) { /* ignore */ }
  }
  res.clearCookie('sb_token');
  res.json({ success: true, message: 'Logged out.' });
});

exports.me = asyncHandler(async (req, res) => {
  // req.user is already populated by the requireAuth middleware, which
  // verified the token against Supabase — no extra lookup needed here.
  res.json({ success: true, user: shapeUser(req.user) });
});
