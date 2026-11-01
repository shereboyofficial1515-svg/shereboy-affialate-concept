// Runs in its own process, so the low limits here don't affect the other tests.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers/harness');

let app;
before(async () => { app = await startApp({ email: false, env: { NEWSLETTER_RATE_LIMIT_MAX: '3' } }); });
after(() => app.close());

test('with no Resend key, signups are kept, the visitor is told the truth, and nothing crashes', async () => {
  const res = await app.post('/api/newsletter/subscribe', { email: 'early@example.test' });
  assert.equal(res.status, 201);
  assert.match(res.json.message, /saved/i);
  assert.equal(app.db.table('subscribers')[0].status, 'pending');

  const status = await app.get('/api/admin/email/status', { as: 'admin' });
  assert.equal(status.json.email.configured, false);

  const created = await app.post('/api/admin/email/campaigns', { subject: 'Hello there', heading: 'Hello there', body: 'Text' }, { as: 'admin' });
  assert.equal(created.status, 201);
  const send = await app.post(`/api/admin/email/campaigns/${created.json.campaign.id}/send`, {}, { as: 'admin' });
  assert.equal(send.status, 409);
  assert.equal((await app.post(`/api/admin/email/campaigns/${created.json.campaign.id}/test`, {}, { as: 'admin' })).status, 503);
});

test('signup attempts from one address are rate limited', async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await app.post('/api/newsletter/subscribe', { email: `r${i}@example.test` })).status);
  assert.equal(codes.at(-1), 429);
  assert.ok(codes.slice(0, 2).every((c) => c === 201));
});
