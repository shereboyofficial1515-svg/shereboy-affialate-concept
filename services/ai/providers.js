// services/ai/providers.js
// The only code that talks to AI providers. Keys come from the server's
// environment, or from an encrypted value saved in the dashboard, and are never
// returned to the browser, logged, or put in a URL.

const crypto = require('crypto');
const { supabaseAdmin } = require('../../config/supabase');

const PROVIDERS = {
  gemini: { label: 'Google Gemini', env: 'GEMINI_API_KEY', base: () => process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com' },
  anthropic: { label: 'Anthropic Claude', env: 'ANTHROPIC_API_KEY', base: () => process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com' },
  openai: { label: 'OpenAI', env: 'OPENAI_API_KEY', base: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com' }
};
const REQUEST_TIMEOUT_MS = 60000;

// ---------- Encrypted key storage ----------
const encryptionKey = () => (process.env.SETTINGS_ENCRYPTION_KEY
  ? crypto.createHash('sha256').update(process.env.SETTINGS_ENCRYPTION_KEY).digest()
  : null);

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

function decrypt(stored) {
  const [iv, tag, body] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

const secretName = (provider) => `ai_key_${provider}`;

async function saveKey(provider, key, actorEmail) {
  if (!encryptionKey()) {
    const err = new Error(`Keys can't be saved here until SETTINGS_ENCRYPTION_KEY is set on the server. You can set ${PROVIDERS[provider].env} on the server instead.`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const row = { key: secretName(provider), ciphertext: encrypt(key), updated_by: actorEmail, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin.from('secure_settings').update(row).eq('key', row.key).select('key');
  if (error) throw new Error('Failed to save the key.');
  if (!data || !data.length) {
    const { error: insertError } = await supabaseAdmin.from('secure_settings').insert(row);
    if (insertError) throw new Error('Failed to save the key.');
  }
}

async function deleteKey(provider) {
  const { error } = await supabaseAdmin.from('secure_settings').delete().eq('key', secretName(provider));
  if (error) throw new Error('Failed to remove the key.');
}

async function storedKey(provider) {
  if (!encryptionKey()) return null;
  const { data, error } = await supabaseAdmin.from('secure_settings').select('ciphertext').eq('key', secretName(provider)).maybeSingle();
  if (error || !data) return null;
  try {
    return decrypt(data.ciphertext);
  } catch {
    console.error('[ai] a saved key could not be decrypted; was SETTINGS_ENCRYPTION_KEY changed?');
    return null;
  }
}

/** A key saved in the dashboard takes priority over the environment. */
async function resolveKey(provider) {
  const saved = await storedKey(provider);
  if (saved) return { key: saved, source: 'dashboard' };
  const env = process.env[PROVIDERS[provider].env];
  if (env && env !== 'your_gemini_api_key_here' && !/^replace_this/.test(env)) return { key: env, source: 'environment' };
  return { key: null, source: null };
}

/** Safe to send to the dashboard: says where a key is, never what it is. */
async function keyStatus() {
  const out = {};
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    const { source } = await resolveKey(id);
    out[id] = { label: provider.label, configured: !!source, source, envName: provider.env };
  }
  return { providers: out, canStoreKeys: !!encryptionKey() };
}

// ---------- Requests ----------
class AiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

async function send(url, options) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new AiError(err.name === 'TimeoutError' ? 'The AI provider took too long to answer.' : "Couldn't reach the AI provider.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error?.message || body.message || `HTTP ${response.status}`;
    throw new AiError(friendly(response.status, detail), { status: response.status });
  }
  return body;
}

function friendly(status, detail) {
  if (status === 401 || status === 403) return 'The AI provider rejected the API key.';
  if (status === 404) return `The AI provider doesn't recognise this model. (${String(detail).slice(0, 200)})`;
  if (status === 429) return 'The AI provider says the usage limit has been reached. Try again later or check your provider plan.';
  return `The AI provider returned an error: ${String(detail).slice(0, 300)}`;
}

const CALLS = {
  async gemini({ key, model, system, messages, maxTokens, temperature }) {
    const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
    const data = await send(`${PROVIDERS.gemini.base()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature, maxOutputTokens: maxTokens } })
    });
    const candidate = data.candidates && data.candidates[0];
    return {
      text: candidate?.content?.parts?.map((p) => p.text || '').join('') || '',
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      // Gemini's "thinking" counts toward the output limit and the bill
      outputTokens: (data.usageMetadata?.candidatesTokenCount || 0) + (data.usageMetadata?.thoughtsTokenCount || 0),
      truncated: candidate?.finishReason === 'MAX_TOKENS'
    };
  },

  async anthropic({ key, model, system, messages, maxTokens, temperature }) {
    const request = (extra) => send(`${PROVIDERS.anthropic.base()}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system, max_tokens: maxTokens, messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })), ...extra })
    });
    let data;
    try {
      data = await request({ temperature });
    } catch (err) {
      // Some models don't accept a temperature: the request still has an answer without it
      if (err.status !== 400 || !/temperature/i.test(err.message)) throw err;
      data = await request({});
    }
    return {
      text: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      truncated: data.stop_reason === 'max_tokens'
    };
  },

  async openai({ key, model, system, messages, maxTokens, temperature }) {
    const request = (extra) => send(`${PROVIDERS.openai.base()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))], ...extra })
    });
    let data;
    try {
      data = await request({ temperature });
    } catch (err) {
      if (err.status !== 400 || !/temperature/i.test(err.message)) throw err;
      data = await request({});
    }
    const choice = data.choices && data.choices[0];
    return {
      text: choice?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      truncated: choice?.finish_reason === 'length'
    };
  }
};

async function callProvider({ provider, ...request }) {
  const { key } = await resolveKey(provider);
  if (!key) throw new AiError(`No API key is set for ${PROVIDERS[provider].label}.`);
  return CALLS[provider]({ key, ...request });
}

/** A real request to the provider: proves the key works and lists usable models. */
async function listModels(provider) {
  const { key } = await resolveKey(provider);
  if (!key) throw new AiError(`No API key is set for ${PROVIDERS[provider].label}.`);
  const base = PROVIDERS[provider].base();
  if (provider === 'gemini') {
    const data = await send(`${base}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    return (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  }
  if (provider === 'anthropic') {
    const data = await send(`${base}/v1/models?limit=100`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
    return (data.data || []).map((m) => m.id);
  }
  const data = await send(`${base}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
  return (data.data || []).map((m) => m.id).sort();
}

module.exports = { PROVIDERS, AiError, callProvider, listModels, keyStatus, saveKey, deleteKey, encrypt, decrypt };
