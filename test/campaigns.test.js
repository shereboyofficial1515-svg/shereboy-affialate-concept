const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Webhook } = require('standardwebhooks');
const { startApp, waitUntil, ADMIN_EMAIL, SIGNING_SECRET } = require('./helpers/harness');

let app;
before(async () => {
  app = await startApp({
    seed: {
      categories: [{ id: 1, name: 'Home', slug: 'home', icon: 'home' }],
      products: [
        { id: 1, name: 'Mixer <Pro>', slug: 'mixer', price: 1000, discount_percent: 20, category_id: 1, affiliate_link: 'https://shop.test/1', availability: 'in_stock', is_featured: false, is_deal: false, images: ['https://cdn.test/mixer.webp'] },
        { id: 2, name: 'Old Stock', slug: 'old', price: 500, discount_percent: 0, category_id: 1, affiliate_link: 'https://shop.test/2', availability: 'in_stock', is_featured: false, is_deal: false, images: ['/uploads/gone.jpg'] }
      ]
    }
  });
});
after(() => app.close());

beforeEach(async () => {
  app.resend.emails.length = 0;
  app.resend.failures.length = 0;
  app.db.table('email_logs').length = 0;
  app.db.table('email_campaigns').length = 0;
  app.db.table('subscribers').length = 0;
  for (const [email, status] of [['a@x.test', 'confirmed'], ['b@x.test', 'confirmed'], ['p@x.test', 'pending'], ['u@x.test', 'unsubscribed'], ['bad@x.test', 'bounced'], ['c@x.test', 'complained']]) {
    await app.db.supabaseAdmin.from('subscribers').insert({ email, status });
  }
});

const draft = (over = {}) => ({ kind: 'announcement', subject: 'New: the mixer', heading: 'Meet the mixer', body: 'It mixes.\n\nVery well.', product_ids: [1, 2], ...over });
const create = async (over) => (await app.post('/api/admin/email/campaigns', draft(over), { as: 'admin' })).json.campaign;
const campaignRow = (id) => app.db.table('email_campaigns').find((c) => c.id === id);
const finished = (id) => waitUntil(async () => {
  const { json } = await app.get(`/api/admin/email/campaigns/${id}`, { as: 'admin' });
  return !json.campaign.running && json.campaign.status !== 'sending' ? json.campaign : null;
});

test('every email admin route refuses visitors and non-administrators', async () => {
  const routes = [
    ['get', '/api/admin/email/status'], ['get', '/api/admin/email/subscribers'], ['get', '/api/admin/email/campaigns'],
    ['get', '/api/admin/email/logs'], ['post', '/api/admin/email/campaigns'], ['post', '/api/admin/email/campaigns/1/send'],
    ['post', '/api/admin/email/subscribers/confirm-all-pending'], ['del', '/api/admin/email/subscribers/1']
  ];
  for (const [method, url] of routes) {
    assert.equal((await app[method](url, method === 'post' ? {} : undefined)).status, 401, url);
    const asVisitor = method === 'post' ? await app.post(url, {}, { as: 'visitor' }) : await app[method](url, { as: 'visitor' });
    assert.equal(asVisitor.status, 403, url);
  }
  assert.equal((await app.get('/api/contact/subscribers')).status, 404, 'the old list route is gone');
});

test('subscriber list searches and filters, and never includes tokens', async () => {
  const all = await app.get('/api/admin/email/subscribers', { as: 'admin' });
  assert.equal(all.json.total, 6);
  assert.ok(!/token/.test(all.text), 'tokens stay on the server');
  assert.equal((await app.get('/api/admin/email/subscribers?status=confirmed', { as: 'admin' })).json.total, 2);
  const search = await app.get('/api/admin/email/subscribers?q=BAD', { as: 'admin' });
  assert.deepEqual(search.json.subscribers.map((s) => s.email), ['bad@x.test']);
  // "%" must be a literal character in the search, not a wildcard
  assert.equal((await app.get(`/api/admin/email/subscribers?q=${encodeURIComponent('%')}`, { as: 'admin' })).json.total, 0);
});

test('status reports counts and connection state without exposing the key', async () => {
  const { json, text } = await app.get('/api/admin/email/status', { as: 'admin' });
  assert.equal(json.email.configured, true);
  assert.equal(json.counts.confirmed, 2);
  assert.ok(!text.includes('re_test_key'));
});

test('an admin can unsubscribe or delete someone, but can not mark them confirmed', async () => {
  const pending = app.db.table('subscribers').find((s) => s.email === 'p@x.test');
  assert.equal((await app.post(`/api/admin/email/subscribers/${pending.id}/unsubscribe`, {}, { as: 'admin' })).status, 200);
  assert.equal(pending.status, 'unsubscribed');
  assert.equal((await app.del(`/api/admin/email/subscribers/${pending.id}`, { as: 'admin' })).status, 200);
  assert.equal(app.db.table('subscribers').length, 5);
  assert.equal((await app.put(`/api/admin/email/subscribers/1`, { status: 'confirmed' }, { as: 'admin' })).status, 404);
});

test('existing subscribers can be asked to confirm, individually or in bulk, without repeats', async () => {
  await app.db.supabaseAdmin.from('subscribers').insert({ email: 'p2@x.test', status: 'pending' });
  const res = await app.post('/api/admin/email/subscribers/confirm-all-pending', {}, { as: 'admin' });
  assert.equal(res.json.sent, 2);
  assert.deepEqual(app.resend.emails.map((e) => e.to[0]).sort(), ['p2@x.test', 'p@x.test']);

  const again = await app.post('/api/admin/email/subscribers/confirm-all-pending', {}, { as: 'admin' });
  assert.equal(again.json.sent, 0);
  assert.equal(again.json.skipped, 2);

  const confirmed = app.db.table('subscribers').find((s) => s.email === 'a@x.test');
  assert.equal((await app.post(`/api/admin/email/subscribers/${confirmed.id}/resend-confirmation`, {}, { as: 'admin' })).status, 400);
});

test('campaign input is validated', async () => {
  const bad = [
    { subject: 'x' }, { heading: '' }, { product_ids: [1.5] }, { product_ids: 'all' }, { body: '', product_ids: [] },
    { product_ids: Array.from({ length: 13 }, (_, i) => i + 1) }
  ];
  for (const over of bad) {
    assert.equal((await app.post('/api/admin/email/campaigns', draft(over), { as: 'admin' })).status, 400, JSON.stringify(over));
  }
});

test('sending reaches confirmed subscribers only, each with their own unsubscribe link', async () => {
  const campaign = await create();
  const res = await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  assert.equal(res.status, 202);
  const done = await finished(campaign.id);

  assert.equal(done.status, 'sent');
  assert.equal(done.sent_count, 2);
  assert.equal(done.recipient_count, 2);
  assert.deepEqual(app.resend.emails.map((e) => e.to[0]).sort(), ['a@x.test', 'b@x.test']);

  for (const email of app.resend.emails) {
    const row = app.db.table('subscribers').find((s) => s.email === email.to[0]);
    assert.ok(email.html.includes(`unsubscribe.html?token=${row.unsubscribe_token}`));
    assert.ok(email.headers['List-Unsubscribe'].includes(row.unsubscribe_token));
    assert.ok(email.text.includes(row.unsubscribe_token), 'plain-text part has the link too');
    assert.equal(email.idempotencyKey, `campaign-${campaign.id}-subscriber-${row.id}`);
    assert.ok(email.html.includes('https://cdn.test/mixer.webp'), 'real product image');
    assert.ok(email.html.includes('Mixer &lt;Pro&gt;'), 'names are escaped');
    assert.ok(email.html.includes('₦800') && email.html.includes('-20%'), 'real price and discount');
    assert.ok(!email.html.includes('/uploads/gone.jpg'), 'dead images are never emailed');
  }
});

test('emails use the JPEG copy of stored images, since classic Outlook can not display WebP', async () => {
  const stored = 'https://cdn.test/storage/v1/object/public/product-images/products/opt-9-a.webp';
  app.db.table('products')[0].images = [stored];
  const campaign = await create();
  await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  await finished(campaign.id);
  assert.ok(app.resend.emails[0].html.includes(stored.replace('.webp', '-w480.jpg')));
  assert.ok(!app.resend.emails[0].html.includes(stored));
  app.db.table('products')[0].images = ['https://cdn.test/mixer.webp'];
});

test('a campaign can not be sent twice, edited or deleted after sending', async () => {
  const campaign = await create();
  const [first, second] = await Promise.all([
    app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' }),
    app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [202, 409]);
  await finished(campaign.id);
  assert.equal(app.resend.emails.length, 2);

  assert.equal((await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' })).status, 409);
  assert.equal((await app.put(`/api/admin/email/campaigns/${campaign.id}`, draft(), { as: 'admin' })).status, 409);
  assert.equal((await app.del(`/api/admin/email/campaigns/${campaign.id}`, { as: 'admin' })).status, 409);
});

test('with nobody confirmed, sending is refused instead of silently doing nothing', async () => {
  app.db.table('subscribers').forEach((s) => { s.status = 'pending'; });
  const campaign = await create();
  assert.equal((await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' })).status, 409);
  assert.equal(campaignRow(campaign.id).status, 'draft');
});

test('one bad recipient does not stop the rest, and "retry" sends only to those who failed', async () => {
  const campaign = await create();
  app.resend.failures.push({ status: 422, name: 'validation_error', message: 'Invalid recipient' });
  await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  const partial = await finished(campaign.id);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.sent_count, 1);
  assert.equal(partial.failed_count, 1);
  assert.equal(app.resend.emails.length, 1);
  const delivered = app.resend.emails[0].to[0];

  assert.equal((await app.post(`/api/admin/email/campaigns/${campaign.id}/resume`, {}, { as: 'admin' })).status, 202);
  const done = await finished(campaign.id);
  assert.equal(done.status, 'sent');
  assert.equal(done.sent_count, 2);
  assert.equal(done.failed_count, 0);
  assert.equal(app.resend.emails.length, 2);
  assert.notEqual(app.resend.emails[1].to[0], delivered, 'nobody received it twice');
});

test('a campaign interrupted by a restart resumes without double-sending', async () => {
  const campaign = await create();
  // State left behind by a crash after the first recipient
  campaignRow(campaign.id).status = 'sending';
  const first = app.db.table('subscribers').find((s) => s.email === 'a@x.test');
  await app.db.supabaseAdmin.from('email_logs').insert({ kind: 'campaign', campaign_id: campaign.id, subscriber_id: first.id, email: first.email, subject: 's', status: 'sent' });

  const listed = await app.get('/api/admin/email/campaigns', { as: 'admin' });
  assert.equal(listed.json.campaigns[0].running, false, 'the dashboard can see it is stuck');
  assert.equal((await app.post(`/api/admin/email/campaigns/${campaign.id}/resume`, {}, { as: 'admin' })).status, 202);
  const done = await finished(campaign.id);
  assert.equal(done.status, 'sent');
  assert.deepEqual(app.resend.emails.map((e) => e.to[0]), ['b@x.test']);
});

test('an unsubscribe before sending is honoured', async () => {
  const campaign = await create();
  const row = app.db.table('subscribers').find((s) => s.email === 'b@x.test');
  await app.post('/api/newsletter/unsubscribe', { token: row.unsubscribe_token });
  await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  await finished(campaign.id);
  assert.deepEqual(app.resend.emails.map((e) => e.to[0]), ['a@x.test']);
});

test('test sends go only to the chosen address, are marked, and do not change the draft', async () => {
  const campaign = await create();
  const res = await app.post(`/api/admin/email/campaigns/${campaign.id}/test`, { email: 'me@x.test' }, { as: 'admin' });
  assert.equal(res.status, 200);
  assert.deepEqual(app.resend.emails[0].to, ['me@x.test']);
  assert.match(app.resend.emails[0].subject, /^\[TEST\]/);
  assert.equal(campaignRow(campaign.id).status, 'draft');
  const { json } = await app.get(`/api/admin/email/campaigns/${campaign.id}`, { as: 'admin' });
  assert.equal(json.campaign.stats.sent, 0, 'a test does not count towards the campaign');

  assert.equal((await app.post(`/api/admin/email/campaigns/${campaign.id}/test`, { email: '' }, { as: 'admin' })).status, 200);
  assert.deepEqual(app.resend.emails[1].to, [ADMIN_EMAIL], 'defaults to the admin');
  assert.equal((await app.post(`/api/admin/email/campaigns/${campaign.id}/test`, { email: 'nope' }, { as: 'admin' })).status, 400);
});

function signed(event) {
  const body = JSON.stringify(event);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const when = new Date();
  const signature = new Webhook(SIGNING_SECRET).sign(id, when, body);
  return { body, headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(when / 1000)), 'svix-signature': signature, 'content-type': 'application/json' } };
}
const hook = (type, emailId, data = {}) => {
  const { body, headers } = signed({ type, data: { email_id: emailId, ...data } });
  return fetch(`${app.base}/api/email/webhook`, { method: 'POST', headers, body });
};

test('delivery webhooks update statistics; forged ones are rejected', async () => {
  const campaign = await create();
  await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  await finished(campaign.id);
  const [one, two] = app.resend.emails;

  const forged = await fetch(`${app.base}/api/email/webhook`, {
    method: 'POST',
    headers: { 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'email.complained', data: { email_id: one.id } })
  });
  assert.equal(forged.status, 401);
  assert.equal(app.db.table('email_logs').find((l) => l.resend_id === one.id).status, 'sent');

  assert.equal((await hook('email.delivered', one.id)).status, 200);
  assert.equal((await hook('email.opened', one.id)).status, 200);
  assert.equal((await hook('email.clicked', one.id)).status, 200);
  assert.equal((await hook('email.delivered', one.id)).status, 200); // arriving late must not undo "clicked"
  assert.equal((await hook('email.delivered', two.id)).status, 200);
  assert.equal(app.db.table('email_logs').find((l) => l.resend_id === one.id).status, 'clicked');

  const { json } = await app.get(`/api/admin/email/campaigns/${campaign.id}`, { as: 'admin' });
  assert.deepEqual(
    [json.campaign.stats.sent, json.campaign.stats.delivered, json.campaign.stats.opened, json.campaign.stats.clicked],
    [2, 2, 1, 1]
  );
});

test('complaints and permanent bounces stop further email; temporary bounces do not', async () => {
  const campaign = await create();
  await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  await finished(campaign.id);
  const status = (to) => app.db.table('subscribers').find((s) => s.email === to.to[0]).status;
  const [one, two] = app.resend.emails;

  await hook('email.bounced', one.id, { bounce: { type: 'Transient', message: 'Mailbox full' } });
  assert.equal(status(one), 'confirmed');
  await hook('email.bounced', one.id, { bounce: { type: 'Permanent', message: 'No such user' } });
  assert.equal(status(one), 'bounced');
  await hook('email.complained', two.id);
  assert.equal(status(two), 'complained');

  const next = await create({ subject: 'Second campaign' });
  assert.equal((await app.post(`/api/admin/email/campaigns/${next.id}/send`, {}, { as: 'admin' })).status, 409, 'nobody left to send to');
});

test('webhook is refused when no signing secret is configured, and unknown events are ignored', async () => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  delete process.env.RESEND_WEBHOOK_SECRET;
  const { body, headers } = signed({ type: 'email.delivered', data: { email_id: 'x' } });
  assert.equal((await fetch(`${app.base}/api/email/webhook`, { method: 'POST', headers, body })).status, 503);
  process.env.RESEND_WEBHOOK_SECRET = secret;
  assert.equal((await hook('contact.created', 'nope')).status, 200);
  assert.equal((await hook('email.delivered', 'unknown-id')).status, 200);
});

test('the send log lists attempts with reasons, without tokens', async () => {
  app.resend.failures.push({ status: 422, name: 'validation_error', message: 'Bad address' });
  const campaign = await create();
  await app.post(`/api/admin/email/campaigns/${campaign.id}/send`, {}, { as: 'admin' });
  await finished(campaign.id);
  const { json, text } = await app.get('/api/admin/email/logs', { as: 'admin' });
  assert.equal(json.total, 2);
  assert.ok(json.logs.some((l) => l.status === 'failed' && l.error === 'Bad address'));
  assert.ok(!/token/i.test(text));
  assert.equal((await app.get('/api/admin/email/logs?status=failed', { as: 'admin' })).json.total, 1);
});
