// controllers/emailAdminController.js
// Admin-only (every route requires an administrator session): subscribers,
// campaigns, delivery statistics and the send log.

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const Subscriber = require('../models/Subscriber');
const { sendEmail, isConfigured } = require('../services/email/client');
const { logAttempt } = require('../services/email/log');
const { sendConfirmation } = require('../services/email/subscriptions');
const campaignSender = require('../services/email/campaignSender');
const templates = require('../services/email/templates');
const validator = require('validator');

const KINDS = ['announcement', 'weekly', 'update'];
const MAX_PRODUCTS = 12;

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const positiveInt = (value, fallback, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
};

exports.status = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    email: {
      configured: isConfigured(),
      from: process.env.EMAIL_FROM || null,
      webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET
    },
    counts: await Subscriber.counts()
  });
});

// ---------- Subscribers ----------
exports.listSubscribers = asyncHandler(async (req, res) => {
  const status = Subscriber.STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const result = await Subscriber.list({ q, status, page: positiveInt(req.query.page, 1, 100000) });
  res.json({ success: true, ...result });
});

exports.resendConfirmation = asyncHandler(async (req, res) => {
  const subscriber = await Subscriber.findById(req.params.id);
  if (!subscriber) throw clientError('Subscriber not found.', 404);
  if (subscriber.status !== 'pending') throw clientError('Only pending subscribers can be sent a confirmation.');
  if (!isConfigured()) throw clientError('Email is not configured yet. Set RESEND_API_KEY and EMAIL_FROM first.', 503);
  const outcome = await sendConfirmation(subscriber);
  if (outcome !== 'sent') throw clientError('The confirmation email could not be sent. See the send log.', 502);
  res.json({ success: true, message: 'Confirmation email sent.' });
});

// Asks everyone still pending to confirm, skipping anyone asked in the last 24 hours
exports.confirmAllPending = asyncHandler(async (req, res) => {
  if (!isConfigured()) throw clientError('Email is not configured yet. Set RESEND_API_KEY and EMAIL_FROM first.', 503);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let afterId = 0, sent = 0, failed = 0, skipped = 0;
  for (;;) {
    const page = await Subscriber.pageByStatus('pending', afterId);
    if (!page.length) break;
    for (const subscriber of page) {
      afterId = subscriber.id;
      if (subscriber.confirm_sent_at && new Date(subscriber.confirm_sent_at).getTime() > dayAgo) { skipped++; continue; }
      if ((await sendConfirmation(subscriber)) === 'sent') sent++; else failed++;
    }
  }
  res.json({ success: true, message: `Sent ${sent}, failed ${failed}, skipped ${skipped} (asked in the last 24 hours).`, sent, failed, skipped });
});

// An admin may stop mail to someone. They can't mark anyone as confirmed: only
// the person who owns the address can give that consent.
exports.unsubscribeSubscriber = asyncHandler(async (req, res) => {
  const subscriber = await Subscriber.findById(req.params.id);
  if (!subscriber) throw clientError('Subscriber not found.', 404);
  await Subscriber.update(subscriber.id, { status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token_hash: null, confirm_expires_at: null, confirm_sent_at: null });
  res.json({ success: true, message: 'Subscriber unsubscribed.' });
});

exports.deleteSubscriber = asyncHandler(async (req, res) => {
  await Subscriber.remove(req.params.id);
  res.json({ success: true, message: 'Subscriber deleted.' });
});

// ---------- Campaigns ----------
function readCampaign(body) {
  const kind = KINDS.includes(body.kind) ? body.kind : 'announcement';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const heading = typeof body.heading === 'string' ? body.heading.trim() : '';
  const preheader = typeof body.preheader === 'string' ? body.preheader.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const ids = body.product_ids === undefined ? [] : body.product_ids;

  if (subject.length < 3 || subject.length > 150) throw clientError('Subject must be 3-150 characters.');
  if (heading.length < 3 || heading.length > 150) throw clientError('Heading must be 3-150 characters.');
  if (preheader.length > 150) throw clientError('Preview text must be 150 characters or fewer.');
  if (text.length > 10000) throw clientError('Message is too long.');
  if (!Array.isArray(ids) || ids.length > MAX_PRODUCTS || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw clientError(`Choose up to ${MAX_PRODUCTS} products.`);
  }
  if (!text && !ids.length) throw clientError('Add a message or at least one product.');
  return { kind, subject, heading, preheader, body: text, product_ids: ids };
}

async function findCampaign(id) {
  const { data, error } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load campaign: ${error.message}`);
  if (!data) throw clientError('Campaign not found.', 404);
  return data;
}

/** Delivery numbers for these campaigns, from the send log (kept current by the webhook). */
async function deliveryStats(campaignIds) {
  const stats = {};
  campaignIds.forEach((id) => { stats[id] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, failed: 0 }; });
  if (!campaignIds.length) return stats;
  const { data, error } = await supabaseAdmin
    .from('email_logs').select('campaign_id, status').in('campaign_id', campaignIds).limit(100000);
  if (error) throw new Error(`Failed to load delivery statistics: ${error.message}`);
  // A clicked email was also opened and delivered, so each stage includes the later ones
  const reached = { sent: ['sent'], delivery_delayed: ['sent'], delivered: ['sent', 'delivered'], opened: ['sent', 'delivered', 'opened'], clicked: ['sent', 'delivered', 'opened', 'clicked'], bounced: ['sent', 'bounced'], complained: ['sent', 'delivered', 'complained'], failed: ['failed'] };
  (data || []).forEach((row) => (reached[row.status] || []).forEach((stage) => { stats[row.campaign_id][stage]++; }));
  return stats;
}

exports.listCampaigns = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  const stats = await deliveryStats((data || []).map((c) => c.id));
  res.json({
    success: true,
    campaigns: (data || []).map((c) => ({ ...c, stats: stats[c.id], running: campaignSender.isRunning(c.id) }))
  });
});

exports.getCampaign = asyncHandler(async (req, res) => {
  const campaign = await findCampaign(req.params.id);
  const stats = await deliveryStats([campaign.id]);
  res.json({ success: true, campaign: { ...campaign, stats: stats[campaign.id], running: campaignSender.isRunning(campaign.id) } });
});

exports.createCampaign = asyncHandler(async (req, res) => {
  const fields = readCampaign(req.body);
  const { data, error } = await supabaseAdmin
    .from('email_campaigns').insert({ ...fields, created_by: req.user.email }).select('*').single();
  if (error) throw new Error(`Failed to save campaign: ${error.message}`);
  res.status(201).json({ success: true, message: 'Draft saved.', campaign: data });
});

exports.updateCampaign = asyncHandler(async (req, res) => {
  const existing = await findCampaign(req.params.id);
  if (existing.status !== 'draft') throw clientError('Only drafts can be edited.', 409);
  const fields = readCampaign(req.body);
  const { data, error } = await supabaseAdmin
    .from('email_campaigns').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', existing.id).select('*').single();
  if (error) throw new Error(`Failed to save campaign: ${error.message}`);
  res.json({ success: true, message: 'Draft saved.', campaign: data });
});

exports.deleteCampaign = asyncHandler(async (req, res) => {
  const existing = await findCampaign(req.params.id);
  if (existing.status !== 'draft') throw clientError('Only drafts can be deleted. Sent campaigns are kept for the record.', 409);
  const { error } = await supabaseAdmin.from('email_campaigns').delete().eq('id', existing.id);
  if (error) throw new Error(`Failed to delete campaign: ${error.message}`);
  res.json({ success: true, message: 'Draft deleted.' });
});

exports.testCampaign = asyncHandler(async (req, res) => {
  if (!isConfigured()) throw clientError('Email is not configured yet. Set RESEND_API_KEY and EMAIL_FROM first.', 503);
  const campaign = await findCampaign(req.params.id);
  const to = typeof req.body.email === 'string' && req.body.email.trim() ? req.body.email.trim() : req.user.email;
  if (!validator.isEmail(to)) throw clientError('Enter a valid email address for the test.');

  const products = await campaignSender.campaignProducts(campaign);
  // A real unsubscribe token isn't used for a test, so the link goes nowhere harmful
  const message = templates.campaignEmail({ campaign: { ...campaign, subject: `[TEST] ${campaign.subject}` }, products, unsubscribeToken: 'test' });
  // Logged without the campaign's id: a test is not part of its delivery statistics
  const ok = await logAttempt({ kind: 'test', email: to, subject: message.subject }, () =>
    sendEmail({ to, ...message, tags: [{ name: 'kind', value: 'test' }] }));
  if (!ok) throw clientError('The test email could not be sent. See the send log for the reason.', 502);
  res.json({ success: true, message: `Test email sent to ${to}.` });
});

// Sending takes a while, so this starts it and answers straight away. The status
// change only succeeds from a sendable state, so a double-click can't send twice.
async function claimAndStart(id, fromStatuses, res) {
  if (!isConfigured()) throw clientError('Email is not configured yet. Set RESEND_API_KEY and EMAIL_FROM first.', 503);
  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .update({ status: 'sending', started_at: new Date().toISOString(), finished_at: null, updated_at: new Date().toISOString() })
    .eq('id', id).in('status', fromStatuses).select('id');
  if (error) throw new Error(`Failed to start campaign: ${error.message}`);
  if (!data || !data.length) throw clientError('This campaign has already been sent or is sending.', 409);
  campaignSender.start(Number(id));
  res.status(202).json({ success: true, message: 'Sending started. You can leave this page; it continues in the background.' });
}

exports.sendCampaign = asyncHandler(async (req, res) => {
  const { count, error } = await supabaseAdmin.from('subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed');
  if (error) throw new Error(error.message);
  if (!count) throw clientError('There are no confirmed subscribers to send to yet.', 409);
  await claimAndStart(req.params.id, ['draft'], res);
});

// Picks up after a restart, or tries failed recipients again. Nobody who already
// received this campaign is sent it twice.
exports.resumeCampaign = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (campaignSender.isRunning(id)) throw clientError('This campaign is still sending.', 409);
  await claimAndStart(id, ['sending', 'partial', 'failed'], res);
});

// ---------- Send log ----------
exports.listLogs = asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const perPage = 50;
  let query = supabaseAdmin
    .from('email_logs')
    .select('id, kind, campaign_id, email, subject, status, error, attempts, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (typeof req.query.status === 'string' && /^[a-z_]{1,20}$/.test(req.query.status)) query = query.eq('status', req.query.status);
  const from = (page - 1) * perPage;
  const { data, error, count } = await query.range(from, from + perPage - 1);
  if (error) throw new Error(`Failed to load the send log: ${error.message}`);
  res.json({ success: true, logs: data || [], total: count || 0, page, totalPages: Math.max(1, Math.ceil((count || 0) / perPage)) });
});
