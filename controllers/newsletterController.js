// controllers/newsletterController.js
// The public side of the newsletter: sign up, confirm, unsubscribe.

const asyncHandler = require('../utils/asyncHandler');
const subscriptions = require('../services/email/subscriptions');
const settings = require('../services/settings');

// Identical for new and already-subscribed addresses, so this form can't reveal who is on the list
const CHECK_INBOX = 'Almost done! Check your inbox and tap the link to confirm your subscription.';

exports.subscribe = asyncHandler(async (req, res) => {
  // Hidden field that people can't see and form-filling bots do: pretend it worked
  if (req.body.website) return res.status(201).json({ success: true, message: CHECK_INBOX });

  const { email: emailSettings } = await settings.loadAll();
  if (!emailSettings.newsletter_enabled) return res.status(403).json({ success: false, message: 'Newsletter signups are closed right now.' });

  const outcome = await subscriptions.subscribe(req.body.email, req.body.source === 'footer' ? 'footer' : 'website');
  if (outcome === 'failed') {
    return res.status(503).json({ success: false, message: "We couldn't send your confirmation email just now. Please try again in a few minutes." });
  }
  if (outcome === 'not_configured') {
    return res.status(201).json({ success: true, message: "Thanks! We've saved your request and will email you a confirmation link before sending anything else." });
  }
  res.status(201).json({ success: true, message: CHECK_INBOX });
});

exports.confirm = asyncHandler(async (req, res) => {
  const outcome = await subscriptions.confirm(req.body.token);
  const replies = {
    confirmed: [200, "You're subscribed! A welcome email is on its way."],
    already: [200, 'Your subscription is already confirmed.'],
    expired: [410, 'This link has expired. Please subscribe again to get a new one.'],
    invalid: [400, 'This link is not valid. It may have already been used.']
  };
  const [status, message] = replies[outcome];
  res.status(status).json({ success: status === 200, outcome, message });
});

exports.unsubscribe = asyncHandler(async (req, res) => {
  const outcome = await subscriptions.unsubscribe(req.body.token);
  if (outcome === 'invalid') {
    return res.status(400).json({ success: false, outcome, message: 'This unsubscribe link is not valid.' });
  }
  res.json({ success: true, outcome, message: "You've been unsubscribed and won't receive any more marketing emails from us." });
});

// One-click unsubscribe from a mail app's own button (RFC 8058)
exports.oneClick = asyncHandler(async (req, res) => {
  const outcome = await subscriptions.unsubscribe(req.query.token);
  res.status(outcome === 'invalid' ? 400 : 200).json({ success: outcome !== 'invalid' });
});

// Following that link in a browser lands on the normal page, which asks first:
// link scanners open every URL in an email and must not unsubscribe anybody.
exports.oneClickPage = (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.redirect(302, `/unsubscribe.html?token=${encodeURIComponent(token)}`);
};
