// services/email/log.js
// Records every send attempt in email_logs. A logging problem is reported but
// never stops an email, and never loses the send's own result.

const { supabaseAdmin } = require('../../config/supabase');

async function insertLog(row) {
  const { data, error } = await supabaseAdmin.from('email_logs').insert(row).select('id').single();
  if (error) {
    console.error('[email] could not write log:', error.message);
    return null;
  }
  return data.id;
}

async function updateLog(id, fields) {
  if (!id) return;
  const { error } = await supabaseAdmin.from('email_logs').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[email] could not update log:', error.message);
}

/** Runs send(), logging the outcome. Resolves to true if the email was accepted. */
async function logAttempt({ kind, campaignId, subscriberId, email, subject }, send) {
  const id = await insertLog({
    kind,
    campaign_id: campaignId || null,
    subscriber_id: subscriberId || null,
    email,
    subject,
    status: 'queued'
  });
  try {
    const result = await send();
    await updateLog(id, { status: 'sent', resend_id: result.id, attempts: result.attempts, error: null });
    return true;
  } catch (err) {
    console.error(`[email] ${kind} to subscriber ${subscriberId || '-'} failed:`, err.message);
    await updateLog(id, { status: 'failed', error: String(err.message).slice(0, 500), attempts: err.attempts || 1 });
    return false;
  }
}

module.exports = { insertLog, updateLog, logAttempt };
