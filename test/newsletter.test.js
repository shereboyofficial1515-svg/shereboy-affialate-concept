const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { startApp, waitUntil, confirmTokenFrom } = require('./helpers/harness');

let app;
before(async () => {
  app = await startApp({
    seed: {
      categories: [{ id: 1, name: 'Home', slug: 'home', icon: 'home' }],
      products: [{ id: 1, name: 'Mixer', slug: 'mixer', price: 100, discount_percent: 0, category_id: 1, affiliate_link: 'https://shop.test/1', availability: 'in_stock', is_featured: true, is_deal: false, images: ['https://cdn.test/mixer.webp'] }]
    }
  });
});
after(() => app.close());
beforeEach(() => {
  app.resend.emails.length = 0;
  app.resend.failures.length = 0;
  app.db.table('subscribers').length = 0;
  app.db.table('email_logs').length = 0;
});

const subscribe = (email, extra = {}) => app.post('/api/newsletter/subscribe', { email, ...extra });
const subscriber = (email) => app.db.table('subscribers').find((s) => s.email === email);

test('invalid addresses are refused and nothing is stored', async () => {
  for (const email of ['not-an-email', '', 'a@b', { $ne: 1 }, ['x@y.test']]) {
    assert.equal((await subscribe(email)).status, 400, JSON.stringify(email));
  }
  assert.equal(app.db.table('subscribers').length, 0);
});

test('signup stores a pending subscriber and sends a branded confirmation with a working link', async () => {
  const res = await subscribe('Ada@Example.TEST');
  assert.equal(res.status, 201);
  const row = subscriber('ada@example.test');
  assert.equal(row.status, 'pending', 'address normalised, not yet confirmed');

  const [email] = app.resend.emails;
  assert.deepEqual(email.to, ['ada@example.test']);
  assert.equal(email.from, 'SHEREBOY <deals@site.test>');
  assert.match(email.subject, /confirm/i);
  assert.match(email.html, /images\/brand\/email-logo\.png/);
  assert.match(email.html, /https:\/\/site\.test\/confirm-subscription\.html\?token=[a-f0-9]{64}/);

  const token = confirmTokenFrom(email);
  assert.notEqual(row.confirm_token_hash, token, 'only a hash of the token is stored');
  assert.equal(row.confirm_token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(app.db.table('email_logs')[0].status, 'sent');
  assert.equal(app.db.table('email_logs')[0].resend_id, email.id);
});

test('double-submitting creates one row, sends one email, and reveals nothing', async () => {
  const first = await subscribe('dup@example.test');
  const second = await subscribe('DUP@example.test');
  assert.equal(app.db.table('subscribers').length, 1);
  assert.equal(app.resend.emails.length, 1, 'cooldown protects the inbox');
  assert.equal(second.status, first.status);
  assert.equal(second.json.message, first.json.message);
});

test('a confirmed subscriber signing up again sees the same reply and gets no email', async () => {
  await subscribe('c@example.test');
  const fresh = await subscribe('new@example.test');
  await app.post('/api/newsletter/confirm', { token: confirmTokenFrom(app.resend.emails[0]) });
  await waitUntil(() => app.resend.emails.length === 3); // two confirmations + welcome
  app.resend.emails.length = 0;
  const again = await subscribe('c@example.test');
  assert.equal(again.json.message, fresh.json.message);
  assert.equal(app.resend.emails.length, 0);
});

test('the bot honeypot looks successful but stores and sends nothing', async () => {
  const res = await subscribe('bot@example.test', { website: 'http://spam.test' });
  assert.equal(res.status, 201);
  assert.equal(app.db.table('subscribers').length, 0);
  assert.equal(app.resend.emails.length, 0);
});

test('confirming activates the subscription once, then sends a welcome with unsubscribe headers', async () => {
  await subscribe('w@example.test');
  const token = confirmTokenFrom(app.resend.emails[0]);

  const res = await app.post('/api/newsletter/confirm', { token });
  assert.equal(res.status, 200);
  assert.equal(res.json.outcome, 'confirmed');
  const row = subscriber('w@example.test');
  assert.equal(row.status, 'confirmed');
  assert.ok(row.confirmed_at);
  assert.equal(row.confirm_token_hash, null, 'link can not be replayed');

  await waitUntil(() => app.resend.emails.length === 2);
  const welcome = app.resend.emails[1];
  assert.ok(welcome.html.includes(`unsubscribe.html?token=${row.unsubscribe_token}`));
  assert.ok(welcome.html.includes('https://cdn.test/mixer.webp'), 'shows the real product image');
  assert.ok(welcome.html.includes('Warri/Sapele'), 'footer has the postal address');
  assert.equal(welcome.headers['List-Unsubscribe'], `<https://site.test/api/newsletter/one-click?token=${row.unsubscribe_token}>`);
  assert.equal(welcome.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  assert.equal((await app.post('/api/newsletter/confirm', { token })).status, 400);
});

test('expired and made-up confirmation tokens are refused', async () => {
  await subscribe('old@example.test');
  const token = confirmTokenFrom(app.resend.emails[0]);
  subscriber('old@example.test').confirm_expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await app.post('/api/newsletter/confirm', { token })).status, 410);
  assert.equal(subscriber('old@example.test').status, 'pending');

  for (const bad of ['0'.repeat(64), 'short', '', null, { x: 1 }]) {
    assert.equal((await app.post('/api/newsletter/confirm', { token: bad })).status, 400);
  }
});

test('unsubscribe page action works; made-up tokens do not', async () => {
  await subscribe('u@example.test');
  const row = subscriber('u@example.test');
  const res = await app.post('/api/newsletter/unsubscribe', { token: row.unsubscribe_token });
  assert.equal(res.status, 200);
  assert.equal(row.status, 'unsubscribed');
  assert.ok(row.unsubscribed_at);
  assert.equal((await app.post('/api/newsletter/unsubscribe', { token: 'f'.repeat(64) })).status, 400);
});

test('a mail app one-click POST unsubscribes; opening the link (GET) only shows the page', async () => {
  await subscribe('o@example.test');
  const row = subscriber('o@example.test');

  const get = await app.get(`/api/newsletter/one-click?token=${row.unsubscribe_token}`);
  assert.equal(get.status, 302);
  assert.equal(get.headers.get('location'), `/unsubscribe.html?token=${row.unsubscribe_token}`);
  assert.equal(row.status, 'pending', 'a link scanner can not unsubscribe anyone');

  const post = await fetch(`${app.base}/api/newsletter/one-click?token=${row.unsubscribe_token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click'
  });
  assert.equal(post.status, 200);
  assert.equal(row.status, 'unsubscribed');
});

test('someone who unsubscribed can come back, but must confirm again', async () => {
  await subscribe('b@example.test');
  const row = subscriber('b@example.test');
  await app.post('/api/newsletter/unsubscribe', { token: row.unsubscribe_token });
  app.resend.emails.length = 0;

  assert.equal((await subscribe('b@example.test')).status, 201);
  assert.equal(row.status, 'pending');
  assert.equal(app.resend.emails.length, 1);
});

test('addresses that complained or hard-bounced are never mailed again', async () => {
  await subscribe('spam@example.test');
  subscriber('spam@example.test').status = 'complained';
  subscriber('spam@example.test').confirm_sent_at = null;
  app.resend.emails.length = 0;
  assert.equal((await subscribe('spam@example.test')).status, 201);
  assert.equal(app.resend.emails.length, 0);
  assert.equal(subscriber('spam@example.test').status, 'complained');
});

test('temporary Resend failures are retried until they succeed', async () => {
  app.resend.failures.push(
    { status: 500, name: 'application_error', message: 'Temporary problem' },
    { status: 429, name: 'rate_limit_exceeded', message: 'Too many requests' }
  );
  assert.equal((await subscribe('retry@example.test')).status, 201);
  assert.equal(app.resend.emails.length, 1);
  const log = app.db.table('email_logs')[0];
  assert.equal(log.status, 'sent');
  assert.equal(log.attempts, 3);
});

test('a permanent failure is not retried; the visitor is told honestly and may try again', async () => {
  app.resend.failures.push({ status: 403, name: 'validation_error', message: 'The domain is not verified.' });
  const res = await subscribe('fail@example.test');
  assert.equal(res.status, 503);
  assert.ok(!res.text.includes('domain'), 'provider details stay on the server');
  assert.equal(app.resend.failures.length, 0);
  const log = app.db.table('email_logs')[0];
  assert.equal(log.status, 'failed');
  assert.equal(log.attempts, 1);
  assert.match(log.error, /domain is not verified/, 'the reason is kept for the admin');

  assert.equal((await subscribe('fail@example.test')).status, 201, 'no cooldown after a failed send');
  assert.equal(app.resend.emails.length, 1);
});

test('giving up after repeated temporary failures is logged', async () => {
  for (let i = 0; i < 3; i++) app.resend.failures.push({ status: 503, name: 'application_error', message: 'Down' });
  assert.equal((await subscribe('down@example.test')).status, 503);
  const log = app.db.table('email_logs')[0];
  assert.equal(log.status, 'failed');
  assert.equal(log.attempts, 3);
});

test('old signup path still works and now goes through confirmation', async () => {
  assert.equal((await app.post('/api/contact/subscribe', { email: 'legacy@example.test' })).status, 201);
  assert.equal(subscriber('legacy@example.test').status, 'pending');
  assert.equal(app.resend.emails.length, 1);
});

test('confirm and unsubscribe pages exist and do nothing until the button is pressed', async () => {
  await subscribe('p@example.test');
  const row = subscriber('p@example.test');
  const page = await app.get(`/unsubscribe.html?token=${row.unsubscribe_token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /noindex/);
  assert.equal(row.status, 'pending');
  assert.equal((await app.get('/confirm-subscription.html?token=abc')).status, 200);
});
