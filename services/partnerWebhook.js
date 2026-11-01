// services/partnerWebhook.js
// Tells partner sites (the SHEREBOY TECH LTD company website) that product
// data changed, so they refresh their cached copy straight away instead of
// waiting for their periodic refresh.
//
// Only an event name and the product slug are sent — never product data,
// affiliate account details or credentials. Each request is signed with
// HMAC-SHA256 over "<timestamp>.<body>" using a shared secret so the receiver
// can reject forged or replayed calls. Disabled unless both env vars are set.
// Fire-and-forget: a slow or offline partner never delays an admin action.

const crypto = require('crypto');

function notifyPartners(event, item = {}) {
  const url = process.env.COMPANY_SITE_WEBHOOK_URL;
  const secret = process.env.COMPANY_SITE_WEBHOOK_SECRET;
  if (!url || !secret) return;

  const body = JSON.stringify({
    event,
    slug: (item && item.slug) || null,
    occurredAt: new Date().toISOString()
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Affiliate-Timestamp': timestamp,
      'X-Affiliate-Signature': `sha256=${signature}`,
      'User-Agent': 'SHEREBOY-AFFILIATE-Webhook/1.0'
    },
    body,
    signal: controller.signal
  })
    .then(res => { if (!res.ok) console.warn(`[partner-webhook] ${event} → ${res.status}`); })
    .catch(err => console.warn(`[partner-webhook] ${event} failed: ${err.message}`))
    .finally(() => clearTimeout(timer));
}

module.exports = { notifyPartners };
