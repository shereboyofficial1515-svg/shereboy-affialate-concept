// services/email/subscriptions.js
// Double opt-in. Nobody receives marketing email until they click the link sent
// to their own address, so nobody can sign up a stranger. Confirmation tokens
// are stored only as hashes, so a database leak can't confirm anyone.

const crypto = require('crypto');
const Subscriber = require('../../models/Subscriber');
const Product = require('../../models/Product');
const { publicProduct } = require('../productView');
const { sendEmail, isConfigured } = require('./client');
const { logAttempt } = require('./log');
const templates = require('./templates');
const settings = require('../settings');
const { notifyAdmin } = require('./notifications');

const CONFIRM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email) => String(email).trim().toLowerCase();

/** Issues a new link and emails it. Resolves to 'sent', 'failed' or 'not_configured'. */
async function sendConfirmation(subscriber) {
  if (!isConfigured()) return 'not_configured';
  const token = crypto.randomBytes(32).toString('hex');
  await Subscriber.update(subscriber.id, {
    confirm_token_hash: hashToken(token),
    confirm_expires_at: new Date(Date.now() + CONFIRM_LIFETIME_MS).toISOString()
  });
  const confirmUrl = `${templates.site()}/confirm-subscription.html?token=${token}`;
  const message = templates.confirmationEmail({ confirmUrl });
  const ok = await logAttempt({ kind: 'confirmation', subscriberId: subscriber.id, email: subscriber.email, subject: message.subject }, () =>
    sendEmail({ to: subscriber.email, ...message, tags: [{ name: 'kind', value: 'confirmation' }] }));
  if (ok) await Subscriber.update(subscriber.id, { confirm_sent_at: new Date().toISOString() });
  return ok ? 'sent' : 'failed';
}

/**
 * Handles a signup. Returns 'sent' | 'failed' | 'not_configured' | 'suppressed'.
 * The caller shows the same message for already-subscribed addresses, so the
 * form can't be used to find out who is on the list.
 */
async function subscribe(rawEmail, source) {
  const email = normalizeEmail(rawEmail);
  let subscriber = await Subscriber.findByEmail(email);
  if (!subscriber) {
    subscriber = await Subscriber.create({ email, status: 'pending', source: source || 'website' });
    if (!subscriber) subscriber = await Subscriber.findByEmail(email); // lost a race with a double-submit
  }

  if (subscriber.status === 'confirmed') return 'sent';
  // A complaint or hard bounce means mailing this address again harms deliverability
  if (subscriber.status === 'complained' || subscriber.status === 'bounced') return 'suppressed';

  if (subscriber.confirm_sent_at && Date.now() - new Date(subscriber.confirm_sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return 'sent'; // one is already on its way: never let the form flood an inbox
  }
  if (subscriber.status === 'unsubscribed') {
    subscriber = await Subscriber.update(subscriber.id, { status: 'pending', unsubscribed_at: null });
  }
  return sendConfirmation(subscriber);
}

/** Returns 'confirmed' | 'already' | 'expired' | 'invalid'. */
async function confirm(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return 'invalid';
  const subscriber = await Subscriber.findByConfirmHash(hashToken(token));
  if (!subscriber) return 'invalid';
  if (subscriber.status === 'confirmed') return 'already';
  if (!subscriber.confirm_expires_at || new Date(subscriber.confirm_expires_at) < new Date()) return 'expired';

  const updated = await Subscriber.update(subscriber.id, {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    unsubscribed_at: null,
    confirm_token_hash: null,
    confirm_expires_at: null
  });
  sendWelcome(updated).catch((err) => console.error('[email] welcome failed:', err.message));
  return 'confirmed';
}

async function sendWelcome(subscriber) {
  const { email } = await settings.loadAll();
  notifyAdmin('notify_new_subscriber', `New subscriber: ${subscriber.email}`, `${subscriber.email} confirmed their newsletter subscription.`);
  if (!isConfigured() || !email.welcome_enabled) return;
  let products = [];
  try {
    const { items } = await Product.list({ featuredOnly: true, perPage: 4 });
    products = items.map(publicProduct);
  } catch { /* a welcome without products is still a welcome */ }
  const message = templates.welcomeEmail({ unsubscribeToken: subscriber.unsubscribe_token, products });
  await logAttempt({ kind: 'welcome', subscriberId: subscriber.id, email: subscriber.email, subject: message.subject }, () =>
    sendEmail({
      to: subscriber.email,
      ...message,
      headers: templates.unsubscribeHeaders(subscriber.unsubscribe_token),
      tags: [{ name: 'kind', value: 'welcome' }]
    }));
}

/** Returns 'unsubscribed' | 'already' | 'invalid'. Bounce and complaint states are kept. */
async function unsubscribe(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return 'invalid';
  const subscriber = await Subscriber.findByUnsubscribeToken(token);
  if (!subscriber) return 'invalid';
  if (subscriber.status !== 'pending' && subscriber.status !== 'confirmed') return 'already';
  await Subscriber.update(subscriber.id, {
    status: 'unsubscribed',
    unsubscribed_at: new Date().toISOString(),
    confirm_token_hash: null,
    confirm_expires_at: null,
    confirm_sent_at: null // someone who changes their mind gets a new link straight away
  });
  return 'unsubscribed';
}

module.exports = { subscribe, confirm, unsubscribe, sendConfirmation, hashToken, normalizeEmail };
