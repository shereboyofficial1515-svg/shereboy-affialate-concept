// controllers/aiAdminController.js
// The AI Control Centre's API. Keys can be saved or removed here but never read back.

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const settings = require('../services/settings');
const providers = require('../services/ai/providers');
const engine = require('../services/ai/engine');
const { cleanHtml, toPlainText } = require('../services/richText');
const { audit } = require('../services/audit');

// Loaded only when a PDF arrives: it's large, and a problem with it must never stop the site
async function readPdfText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text.replace(/^-- \d+ of \d+ --$/gm, '');
  } finally {
    await parser.destroy();
  }
}

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}
const throwIf = (error, what) => { if (error) throw new Error(`Failed to ${what}: ${error.message}`); };

const CAPABILITY_LABELS = {
  description: 'Product description generator', title: 'Product title generator', seo: 'SEO generator',
  categorize: 'Product categorization', marketing: 'Marketing copy generator', email: 'Email content generator',
  summary: 'Product summary generator', grammar: 'Grammar correction', rewrite: 'Rewriting and proofreading', assistant: 'Customer shopping assistant'
};

// ---------- Configuration ----------
exports.getConfig = asyncHandler(async (req, res) => {
  const all = await settings.loadAll();
  res.json({
    success: true,
    config: all.ai,
    keys: await providers.keyStatus(),
    capabilities: CAPABILITY_LABELS,
    instructionCategories: engine.INSTRUCTION_CATEGORIES,
    knowledgeCategories: engine.KNOWLEDGE_CATEGORIES,
    usage: await engine.monthlyUsage()
  });
});

exports.saveConfig = asyncHandler(async (req, res) => {
  const { value, errors } = await settings.save('ai', req.body, req.user.email);
  if (errors) return res.status(400).json({ success: false, errors });
  await audit(req, 'ai.config.update', { type: 'settings', id: 'ai', details: { provider: value.provider, model: value.model } });
  res.json({ success: true, message: 'AI settings saved.', config: value });
});

exports.saveKey = asyncHandler(async (req, res) => {
  const { provider, key } = req.body;
  if (!providers.PROVIDERS[provider]) throw clientError('Unknown provider.');
  if (typeof key !== 'string' || key.trim().length < 10 || key.length > 500) throw clientError('Enter a valid API key.');
  await providers.saveKey(provider, key.trim(), req.user.email);
  await audit(req, 'ai.key.save', { type: 'ai_key', id: provider }); // the value is never logged
  res.json({ success: true, message: 'Key saved and encrypted. It can’t be viewed again.', keys: await providers.keyStatus() });
});

exports.deleteKey = asyncHandler(async (req, res) => {
  if (!providers.PROVIDERS[req.params.provider]) throw clientError('Unknown provider.');
  await providers.deleteKey(req.params.provider);
  await audit(req, 'ai.key.delete', { type: 'ai_key', id: req.params.provider });
  res.json({ success: true, message: 'Saved key removed.', keys: await providers.keyStatus() });
});

// A real request to the provider, so "connected" means it really is
exports.testConnection = asyncHandler(async (req, res) => {
  const provider = req.body.provider;
  if (!providers.PROVIDERS[provider]) throw clientError('Unknown provider.');
  try {
    const models = await providers.listModels(provider);
    res.json({ success: true, connected: true, models, message: `Connected to ${providers.PROVIDERS[provider].label}. ${models.length} models available.` });
  } catch (err) {
    res.json({ success: true, connected: false, models: [], message: err.message });
  }
});

// ---------- Instructions ----------
function readInstruction(body) {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 3 || text.length > 4000) throw clientError('An instruction must be 3-4,000 characters.');
  if (!engine.INSTRUCTION_CATEGORIES.includes(body.category)) throw clientError('Choose a category.');
  return { title: title || text.slice(0, 60), body: text, category: body.category, is_enabled: body.is_enabled !== false, sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0 };
}

exports.listInstructions = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('ai_instructions').select('*').order('category').order('sort_order').order('id');
  throwIf(error, 'list instructions');
  res.json({ success: true, instructions: data || [] });
});

exports.createInstruction = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('ai_instructions').insert(readInstruction(req.body)).select('*').single();
  throwIf(error, 'save instruction');
  await audit(req, 'ai.instruction.create', { type: 'ai_instruction', id: data.id });
  res.status(201).json({ success: true, instruction: data });
});

exports.updateInstruction = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('ai_instructions')
    .update({ ...readInstruction(req.body), updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').maybeSingle();
  throwIf(error, 'save instruction');
  if (!data) throw clientError('Instruction not found.', 404);
  await audit(req, 'ai.instruction.update', { type: 'ai_instruction', id: data.id });
  res.json({ success: true, instruction: data });
});

exports.deleteInstruction = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.from('ai_instructions').delete().eq('id', req.params.id);
  throwIf(error, 'delete instruction');
  await audit(req, 'ai.instruction.delete', { type: 'ai_instruction', id: req.params.id });
  res.json({ success: true });
});

// Shows the exact prompt, and optionally asks the AI how it reads the instructions
exports.previewInstructions = asyncHandler(async (req, res) => {
  const capability = CAPABILITY_LABELS[req.body.capability] ? req.body.capability : 'description';
  const built = await engine.buildSystemPrompt(capability, String(req.body.sample || '').slice(0, 2000));
  const response = {
    success: true,
    prompt: built.system,
    appliedInstructions: built.instructions.map((i) => i.title),
    usedKnowledge: [...new Set(built.knowledge.map((k) => k.title))]
  };
  if (req.body.run) {
    const action = req.body.sample ? 'test_run' : 'interpret';
    const result = await runAi(req, { action, product: req.body.sample ? { description: String(req.body.sample).slice(0, 4000), name: String(req.body.sample).slice(0, 80) } : undefined });
    response.interpretation = result.text;
  }
  res.json(response);
});

// ---------- Knowledge base ----------
function readKnowledge(body) {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 150) : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title) throw clientError('Give this entry a title.');
  if (text.length < 3 || text.length > 200000) throw clientError('Content must be 3-200,000 characters.');
  if (!engine.KNOWLEDGE_CATEGORIES.includes(body.category)) throw clientError('Choose a category.');
  return { title, body: text, category: body.category, is_enabled: body.is_enabled !== false };
}

exports.listKnowledge = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('ai_knowledge').select('*').order('category').order('title');
  throwIf(error, 'list knowledge');
  res.json({ success: true, entries: data || [] });
});

exports.createKnowledge = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('ai_knowledge').insert(readKnowledge(req.body)).select('*').single();
  throwIf(error, 'save entry');
  await audit(req, 'ai.knowledge.create', { type: 'ai_knowledge', id: data.id });
  res.status(201).json({ success: true, entry: data });
});

exports.updateKnowledge = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('ai_knowledge')
    .update({ ...readKnowledge(req.body), updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').maybeSingle();
  throwIf(error, 'save entry');
  if (!data) throw clientError('Entry not found.', 404);
  res.json({ success: true, entry: data });
});

exports.deleteKnowledge = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.from('ai_knowledge').delete().eq('id', req.params.id);
  throwIf(error, 'delete entry');
  await audit(req, 'ai.knowledge.delete', { type: 'ai_knowledge', id: req.params.id });
  res.json({ success: true });
});

/** Text from a TXT, Markdown, CSV or PDF upload. Stored as an ordinary entry to review and edit. */
exports.uploadKnowledge = asyncHandler(async (req, res) => {
  if (!req.file) throw clientError('Choose a file.');
  const name = String(req.file.originalname || 'document').replace(/[\\/\u0000-\u001f<>"']/g, '').slice(0, 150);
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  let text;
  if (['txt', 'md', 'csv'].includes(ext)) {
    if (req.file.buffer.includes(0)) throw clientError("That file doesn't look like plain text.");
    text = req.file.buffer.toString('utf8');
  } else if (ext === 'pdf') {
    if (req.file.buffer.slice(0, 5).toString('latin1') !== '%PDF-') throw clientError("That file isn't a real PDF.");
    try {
      text = await readPdfText(req.file.buffer);
    } catch {
      throw clientError("That PDF couldn't be read.");
    }
  } else {
    throw clientError('Supported documents are TXT, MD, CSV and PDF.');
  }
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 3) throw clientError('No readable text was found in that file. Scanned PDFs have no text to read.');
  const { data, error } = await supabaseAdmin.from('ai_knowledge').insert({
    title: (req.body.title || name).toString().trim().slice(0, 150),
    category: engine.KNOWLEDGE_CATEGORIES.includes(req.body.category) ? req.body.category : 'general',
    body: text.slice(0, 200000),
    source_filename: name
  }).select('*').single();
  throwIf(error, 'save document');
  await audit(req, 'ai.knowledge.upload', { type: 'ai_knowledge', id: data.id, details: { filename: name } });
  res.status(201).json({ success: true, entry: data, truncated: text.length > 200000 });
});

// ---------- Generation ----------
async function runAi(req, options) {
  try {
    return await engine.run({ ...options, actorEmail: req.user.email });
  } catch (err) {
    if (err instanceof providers.AiError) throw clientError(err.message, err.blocked ? 429 : 502);
    throw err;
  }
}

function readProduct(input) {
  if (!input || typeof input !== 'object') return undefined;
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const specs = input.specifications && typeof input.specifications === 'object' && !Array.isArray(input.specifications) ? input.specifications : undefined;
  return {
    name: text(input.name, 300),
    category: text(input.category, 150),
    price: typeof input.price === 'number' || typeof input.price === 'string' ? input.price : undefined,
    discount_percent: Number(input.discount_percent) || 0,
    short_description: text(input.short_description, 1000),
    description: input.description ? toPlainText(text(input.description, 20000)) : undefined,
    specifications: specs,
    categories: Array.isArray(input.categories) ? input.categories.filter((c) => typeof c === 'string').slice(0, 100) : undefined
  };
}

exports.generate = asyncHandler(async (req, res) => {
  const definition = engine.ACTIONS[req.body.action];
  if (!definition || ['interpret', 'test_run'].includes(req.body.action)) throw clientError('Unknown AI action.');
  const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 20000) : '';
  const instruction = typeof req.body.instruction === 'string' ? req.body.instruction.trim().slice(0, 1000) : '';
  if ((req.body.action === 'custom' || req.body.action === 'marketing') && !instruction) throw clientError('Say what you want the AI to do.');
  const product = readProduct(req.body.product);
  if (!toPlainText(text) && !(product && (product.name || product.description)) && !instruction) {
    throw clientError('There is nothing to work from yet. Add a product name, description or some text first.');
  }

  const result = await runAi(req, { action: req.body.action, text, instruction, product });

  let suggestion = result.text;
  let fields = null;
  if (definition.json) {
    try {
      fields = JSON.parse(suggestion.match(/\{[\s\S]*\}/)[0]);
    } catch {
      throw clientError('The AI answered in an unexpected format. Please try again.', 502);
    }
  } else if (definition.html) {
    suggestion = cleanHtml(/<[a-z][^>]*>/i.test(suggestion) ? suggestion : suggestion.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join(''));
  }

  // Everything the AI was given counts as a source; anything new gets flagged for review
  const source = `${text} ${engine.productFacts(product)} ${instruction}`;
  res.json({
    success: true,
    suggestion: fields ? null : suggestion,
    fields,
    flags: engine.flagNewClaims(source, fields ? JSON.stringify(fields) : suggestion),
    truncated: result.truncated,
    usage: result.usage,
    model: result.model,
    appliedInstructions: result.appliedInstructions,
    usedKnowledge: result.usedKnowledge
  });
});

/** Which tools this person can use, so the editor only offers what will work. */
exports.availableActions = asyncHandler(async (req, res) => {
  const { ai } = await settings.loadAll();
  const { source } = await providers.keyStatus().then((s) => s.providers[ai.provider]);
  const actions = {};
  Object.entries(engine.ACTIONS).forEach(([id, a]) => {
    if (!['interpret', 'test_run'].includes(id) && ai[`capability_${a.capability}`]) actions[id] = a.label;
  });
  res.json({ success: true, configured: !!source, actions });
});

// ---------- Activity ----------
exports.activity = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(1, Number(req.query.days) || 30), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('ai_usage_logs').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(20000);
  throwIf(error, 'load AI activity');

  const rows = data || [];
  const features = {};
  const models = {};
  let inputTokens = 0, outputTokens = 0, cost = 0, hasCost = false;
  rows.forEach((r) => {
    features[r.action || r.feature] = (features[r.action || r.feature] || 0) + 1;
    if (r.model) models[r.model] = (models[r.model] || 0) + 1;
    inputTokens += r.input_tokens || 0;
    outputTokens += r.output_tokens || 0;
    if (r.estimated_cost !== null && r.estimated_cost !== undefined) { cost += Number(r.estimated_cost); hasCost = true; }
  });
  const { ai } = await settings.loadAll();
  const month = await engine.monthlyUsage();
  res.json({
    success: true,
    days,
    totals: {
      requests: rows.length,
      success: rows.filter((r) => r.status === 'success').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      blocked: rows.filter((r) => r.status === 'blocked').length,
      inputTokens,
      outputTokens,
      estimatedCost: hasCost ? cost : null
    },
    features: Object.entries(features).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    models: Object.entries(models).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    month: { ...month, requestLimit: ai.monthly_request_limit, tokenLimit: ai.monthly_token_limit },
    recent: rows.slice(0, 30).map(({ id, feature, action, model, status, input_tokens, output_tokens, error: err, actor_email, created_at }) => ({ id, feature, action, model, status, input_tokens, output_tokens, error: err, actor_email, created_at }))
  });
});
