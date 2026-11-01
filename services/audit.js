// services/audit.js
// Who changed what, for sensitive actions. A logging problem is reported but
// never blocks the action. Callers pass summaries, never secret values.

const { supabaseAdmin } = require('../config/supabase');

async function audit(req, action, target = {}) {
  try {
    const { error } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_email: req.user && req.user.email,
      action,
      target_type: target.type || null,
      target_id: target.id !== undefined ? String(target.id) : null,
      details: target.details || null,
      ip: req.ip || null
    });
    if (error) console.error('[audit] not recorded:', error.message);
  } catch (err) {
    console.error('[audit] not recorded:', err.message);
  }
}

module.exports = { audit };
