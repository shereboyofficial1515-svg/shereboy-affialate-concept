// controllers/emailWebhookController.js
// Resend calls this when something happens to a sent email. Every request's
// signature is checked against the raw body, so a forged one can't mark
// emails delivered or unsubscribe people.

const { supabaseAdmin } = require('../config/supabase');
const { verifyWebhook } = require('../services/email/client');

const EVENT_STATUS = {
  'email.sent': 'sent',
  'email.delivery_delayed': 'delivery_delayed',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed'
};

// Webhooks can arrive out of order: a later "delivered" mustn't undo "clicked"
const RANK = { queued: 0, failed: 0, sent: 1, delivery_delayed: 2, delivered: 3, opened: 4, clicked: 5, bounced: 6, complained: 7 };

exports.handle = async (req, res) => {
  if (!process.env.RESEND_WEBHOOK_SECRET) return res.status(503).json({ success: false });

  let event;
  try {
    event = verifyWebhook(req.body.toString('utf8'), req.headers);
    if (typeof event === 'string') event = JSON.parse(event);
  } catch {
    return res.status(401).json({ success: false });
  }

  const status = EVENT_STATUS[event.type];
  const emailId = event.data && event.data.email_id;
  if (!status || !emailId) return res.json({ success: true }); // an event we don't track

  try {
    const { data: log, error } = await supabaseAdmin
      .from('email_logs').select('id, status, subscriber_id').eq('resend_id', emailId).maybeSingle();
    if (error) throw new Error(error.message);
    if (log) {
      if (RANK[status] >= RANK[log.status]) {
        const fields = { status, updated_at: new Date().toISOString() };
        if (status === 'bounced' && event.data.bounce) fields.error = String(event.data.bounce.message || event.data.bounce.type || '').slice(0, 500);
        const { error: updateError } = await supabaseAdmin.from('email_logs').update(fields).eq('id', log.id);
        if (updateError) throw new Error(updateError.message);
      }
      await suppressIfNeeded(log.subscriber_id, event, status);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[email] webhook could not be processed:', err.message);
    res.status(500).json({ success: false }); // Resend retries
  }
};

// Stop mailing addresses that complained or permanently bounced: continuing
// would damage the sending domain's reputation for everyone else.
async function suppressIfNeeded(subscriberId, event, status) {
  if (!subscriberId) return;
  const permanentBounce = status === 'bounced' && !/transient|temporary/i.test(String(event.data.bounce && event.data.bounce.type));
  if (status !== 'complained' && !permanentBounce) return;
  const { error } = await supabaseAdmin
    .from('subscribers')
    .update({ status: status === 'complained' ? 'complained' : 'bounced', updated_at: new Date().toISOString() })
    .eq('id', subscriberId);
  if (error) throw new Error(error.message);
}
