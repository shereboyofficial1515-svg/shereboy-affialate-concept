// services/email/client.js
// The only file that talks to Resend. The API key is read from the server's
// environment and never reaches the browser. Temporary failures (rate limits,
// Resend outages, dropped connections) are retried with backoff; permanent
// ones (bad address, unverified domain) fail immediately.

const { Resend } = require('resend');
const settings = require('../settings');

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = Number(process.env.EMAIL_RETRY_BASE_MS) || 800;

let client;
function resend() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/** From the Email Settings tab if filled in, otherwise the EMAIL_FROM variable. */
function senderAddress() {
  const { email } = settings.cached();
  if (email.sender_email) return email.sender_name ? `${email.sender_name.replace(/["<>]/g, '')} <${email.sender_email}>` : email.sender_email;
  return process.env.EMAIL_FROM || null;
}

function isConfigured() {
  return !!(process.env.RESEND_API_KEY && senderAddress());
}

class EmailError extends Error {
  constructor(message, { retryable = false, attempts = 1 } = {}) {
    super(message);
    this.name = 'EmailError';
    this.retryable = retryable;
    this.attempts = attempts;
  }
}

function isRetryable(error) {
  const code = Number(error.statusCode);
  return code === 429 || code >= 500 || error.name === 'rate_limit_exceeded' || error.name === 'application_error' || error.name === 'internal_server_error';
}

/**
 * Sends one email. Resolves to { id, attempts }, or throws EmailError.
 * The same idempotencyKey is reused across retries so a retried request can't
 * deliver twice.
 */
async function sendEmail({ to, subject, html, text, headers, idempotencyKey, tags }) {
  await settings.loadAll();
  if (!isConfigured()) throw new EmailError('Email is not configured (RESEND_API_KEY / sender address).');

  const payload = { from: senderAddress(), to: [to], subject, html, text, headers, tags };
  const replyTo = settings.cached().email.reply_to || process.env.EMAIL_REPLY_TO;
  if (replyTo) payload.replyTo = replyTo;

  let lastMessage = 'Unknown email error';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryable = true; // a thrown request is a network problem
    try {
      const { data, error } = await resend().emails.send(payload, idempotencyKey ? { idempotencyKey } : undefined);
      if (!error) return { id: data && data.id, attempts: attempt };
      lastMessage = error.message || error.name || lastMessage;
      retryable = isRetryable(error);
    } catch (err) {
      lastMessage = err.message;
    }
    if (!retryable) throw new EmailError(lastMessage, { attempts: attempt });
    if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * 2 ** (attempt - 1)));
  }
  throw new EmailError(lastMessage, { retryable: true, attempts: MAX_ATTEMPTS });
}

/** Checks a webhook's signature against the raw body; throws if it isn't genuine. */
function verifyWebhook(rawBody, headers) {
  return resend().webhooks.verify({
    payload: rawBody,
    headers: { id: headers['svix-id'], timestamp: headers['svix-timestamp'], signature: headers['svix-signature'] },
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET
  });
}

module.exports = { sendEmail, verifyWebhook, isConfigured, EmailError };
