// services/email/notifications.js
// Short emails to the site owner, when switched on in Email Settings.
// Fire-and-forget: a notification problem never affects the visitor's request.

const settings = require('../settings');
const { sendEmail, isConfigured } = require('./client');
const { logAttempt } = require('./log');

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function notifyAdmin(preference, subject, body) {
  settings.loadAll().then(({ email }) => {
    if (!email[preference] || !email.notify_email || !isConfigured()) return null;
    return logAttempt({ kind: 'test', email: email.notify_email, subject }, () =>
      sendEmail({ to: email.notify_email, subject, text: body, html: `<p>${escapeHtml(body)}</p>`, tags: [{ name: 'kind', value: 'notification' }] }));
  }).catch((err) => console.error('[email] notification failed:', err.message));
}

module.exports = { notifyAdmin };
