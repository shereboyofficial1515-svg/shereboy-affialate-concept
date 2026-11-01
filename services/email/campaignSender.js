// services/email/campaignSender.js
// Sends a campaign to every confirmed subscriber in the background. Each
// recipient gets a log row before their email goes out and the database refuses
// a second row for the same campaign + subscriber, so resuming an interrupted
// campaign (a restart, a deploy) skips anyone already handled.

const { supabaseAdmin } = require('../../config/supabase');
const Subscriber = require('../../models/Subscriber');
const Product = require('../../models/Product');
const { publicProduct } = require('../productView');
const { sendEmail } = require('./client');
const { updateLog } = require('./log');
const templates = require('./templates');

// Resend's default limit is 2 requests a second
const SEND_INTERVAL_MS = process.env.EMAIL_SEND_INTERVAL_MS !== undefined ? Number(process.env.EMAIL_SEND_INTERVAL_MS) : 600;
const active = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadCampaign(id) {
  const { data, error } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load campaign: ${error.message}`);
  return data;
}

async function saveCampaign(id, fields) {
  const { error } = await supabaseAdmin.from('email_campaigns').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[email] could not update campaign:', error.message);
}

/** The campaign's products in the order chosen, skipping any deleted since. */
async function campaignProducts(campaign) {
  const ids = Array.isArray(campaign.product_ids) ? campaign.product_ids : [];
  const rows = await Promise.all(ids.map((id) => Product.findById(id).catch(() => null)));
  return rows.filter((p) => p && p.status === 'published').map(publicProduct);
}

/** Claims this recipient. Returns a log id to send with, or null if already handled. */
async function claimRecipient(campaign, subscriber) {
  const row = { kind: 'campaign', campaign_id: campaign.id, subscriber_id: subscriber.id, email: subscriber.email, subject: campaign.subject, status: 'queued' };
  const { data, error } = await supabaseAdmin.from('email_logs').insert(row).select('id').single();
  if (!error) return data.id;
  if (error.code !== '23505') throw new Error(error.message);

  // Already logged: only a failed attempt, or one interrupted mid-send, is tried again
  const { data: existing, error: readError } = await supabaseAdmin
    .from('email_logs').select('id, status')
    .eq('campaign_id', campaign.id).eq('subscriber_id', subscriber.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  return existing && (existing.status === 'failed' || existing.status === 'queued') ? existing.id : null;
}

async function countLogs(campaignId) {
  const count = async (statuses) => {
    const { count: n, error } = await supabaseAdmin
      .from('email_logs').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).in('status', statuses);
    if (error) throw new Error(error.message);
    return n || 0;
  };
  const [sent, failed] = await Promise.all([
    count(['sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained']),
    count(['failed'])
  ]);
  return { sent, failed };
}

async function run(campaignId) {
  const campaign = await loadCampaign(campaignId);
  const products = await campaignProducts(campaign);
  let afterId = 0;
  let recipients = 0;
  let handledSinceSave = 0;

  for (;;) {
    const page = await Subscriber.pageByStatus('confirmed', afterId);
    if (!page.length) break;
    for (const subscriber of page) {
      afterId = subscriber.id;
      recipients++;
      const logId = await claimRecipient(campaign, subscriber);
      if (!logId) continue;

      const message = templates.campaignEmail({ campaign, products, unsubscribeToken: subscriber.unsubscribe_token });
      try {
        const result = await sendEmail({
          to: subscriber.email,
          ...message,
          headers: templates.unsubscribeHeaders(subscriber.unsubscribe_token),
          idempotencyKey: `campaign-${campaign.id}-subscriber-${subscriber.id}`,
          tags: [{ name: 'kind', value: 'campaign' }, { name: 'campaign_id', value: String(campaign.id) }]
        });
        await updateLog(logId, { status: 'sent', resend_id: result.id, attempts: result.attempts, error: null });
      } catch (err) {
        console.error(`[email] campaign ${campaign.id} to subscriber ${subscriber.id} failed:`, err.message);
        await updateLog(logId, { status: 'failed', error: String(err.message).slice(0, 500), attempts: err.attempts || 1 });
      }

      if (++handledSinceSave >= 25) {
        handledSinceSave = 0;
        await saveCampaign(campaign.id, { recipient_count: recipients, ...(await tally(campaign.id)) });
      }
      if (SEND_INTERVAL_MS) await sleep(SEND_INTERVAL_MS);
    }
  }

  const { sent_count, failed_count } = await tally(campaign.id);
  const status = failed_count === 0 ? 'sent' : sent_count === 0 ? 'failed' : 'partial';
  await saveCampaign(campaign.id, { status, recipient_count: recipients, sent_count, failed_count, finished_at: new Date().toISOString() });
}

async function tally(campaignId) {
  const { sent, failed } = await countLogs(campaignId);
  return { sent_count: sent, failed_count: failed };
}

/** Starts sending without waiting for it to finish. */
function start(campaignId) {
  if (active.has(campaignId)) return;
  active.add(campaignId);
  run(campaignId)
    .catch(async (err) => {
      console.error(`[email] campaign ${campaignId} stopped:`, err.message);
      await saveCampaign(campaignId, { status: 'failed', finished_at: new Date().toISOString() });
    })
    .finally(() => active.delete(campaignId));
}

const isRunning = (campaignId) => active.has(campaignId);

module.exports = { start, isRunning, campaignProducts };
