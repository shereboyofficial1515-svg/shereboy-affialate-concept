// test/helpers/harness.js
// Boots the real Express app against the in-memory database and a local server
// that speaks Resend's HTTP API, so the real Resend SDK runs end to end without
// sending anything.

const http = require('http');
const path = require('path');
const { createFakeSupabase } = require('./fakeSupabase');

const ADMIN_EMAIL = 'owner@example.test';
const SIGNING_SECRET = `whsec_${Buffer.from('test-webhook-signing-secret-1234').toString('base64')}`;

function startMockResend() {
  const state = { emails: [], failures: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const failure = state.failures.shift();
      res.setHeader('content-type', 'application/json');
      if (failure) {
        res.statusCode = failure.status;
        return res.end(JSON.stringify({ statusCode: failure.status, name: failure.name, message: failure.message }));
      }
      const payload = JSON.parse(body);
      const id = `re_${state.emails.length + 1}`;
      state.emails.push({ id, ...payload, idempotencyKey: req.headers['idempotency-key'] });
      res.end(JSON.stringify({ id }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ state, server, url: `http://127.0.0.1:${server.address().port}` });
  }));
}

// Speaks enough of the Gemini API to record exactly what the app sends
function startMockAi() {
  const state = { requests: [], reply: () => '<p>Improved text.</p>', fail: null };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      state.requests.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      res.setHeader('content-type', 'application/json');
      if (state.fail) {
        res.statusCode = state.fail.status;
        return res.end(JSON.stringify({ error: { message: state.fail.message } }));
      }
      if (req.method === 'GET') return res.end(JSON.stringify({ models: [{ name: 'models/gemini-test-model', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-only', supportedGenerationMethods: ['embedContent'] }] }));
      res.end(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: state.reply(JSON.parse(body)) }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }
      }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ state, server, url: `http://127.0.0.1:${server.address().port}` });
  }));
}

async function startApp({ seed = {}, env = {}, email = true } = {}) {
  const resend = await startMockResend();
  const mockAi = await startMockAi();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://fake.test',
    SUPABASE_ANON_KEY: 'x',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    ADMIN_EMAILS: ADMIN_EMAIL,
    ADMIN_EMAIL: '',
    PUBLIC_SITE_URL: 'https://site.test',
    RESEND_BASE_URL: resend.url,
    RESEND_WEBHOOK_SECRET: SIGNING_SECRET,
    GEMINI_BASE_URL: mockAi.url,
    ANTHROPIC_API_KEY: '',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '', // dotenv won't replace these, so the developer's .env can't
    COMPANY_SITE_WEBHOOK_URL: '', // make tests or the preview call real services
    COMPANY_SITE_WEBHOOK_SECRET: '',
    EMAIL_RETRY_BASE_MS: '1',
    EMAIL_SEND_INTERVAL_MS: '0',
    NEWSLETTER_RATE_LIMIT_MAX: '100000',
    NEWSLETTER_TOKEN_RATE_LIMIT_MAX: '100000',
    RATE_LIMIT_MAX_REQUESTS: '100000',
    ...env
  });
  if (email) {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'SHEREBOY <deals@site.test>';
  } else {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  }

  const db = createFakeSupabase(seed);
  db.users.admin = { id: 'u1', email: ADMIN_EMAIL, user_metadata: {}, app_metadata: {} };
  db.users.visitor = { id: 'u2', email: 'someone@example.test', user_metadata: {}, app_metadata: {} };

  const root = path.join(__dirname, '..', '..');
  const configPath = require.resolve(path.join(root, 'config', 'supabase.js'));
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: db };

  // Quiet the request log during tests
  const morganPath = require.resolve('morgan', { paths: [root] });
  require.cache[morganPath] = { id: morganPath, filename: morganPath, loaded: true, exports: () => (req, res, next) => next() };

  const app = require(path.join(root, 'server.js'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, { body, as, headers = {} } = {}) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(as ? { cookie: `sb_token=${as}` } : {}),
        ...headers
      },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
  }

  return {
    db,
    base,
    resend: resend.state,
    ai: mockAi.state,
    req: call,
    get: (url, opts) => call('GET', url, opts),
    post: (url, body, opts) => call('POST', url, { body, ...opts }),
    put: (url, body, opts) => call('PUT', url, { body, ...opts }),
    del: (url, opts) => call('DELETE', url, opts),
    close: async () => {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      if (resend.server.closeAllConnections) resend.server.closeAllConnections();
      await new Promise((resolve) => resend.server.close(resolve));
      if (mockAi.server.closeAllConnections) mockAi.server.closeAllConnections();
      await new Promise((resolve) => mockAi.server.close(resolve));
    }
  };
}

const waitUntil = async (condition, ms = 5000) => {
  const start = Date.now();
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};

const confirmTokenFrom = (email) => email.text.match(/token=([a-f0-9]{64})/)[1];

module.exports = { startApp, waitUntil, confirmTokenFrom, ADMIN_EMAIL, SIGNING_SECRET };
