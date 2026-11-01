// admin/js/ai.js
// AI Control Centre, Teach Your AI, Knowledge Base and AI Activity.

const CATEGORY_LABELS = {
  general: 'All AI writing', product_descriptions: 'Product descriptions', titles: 'Product titles', seo: 'SEO', marketing: 'Marketing', email: 'Email', assistant: 'Customer shopping assistant',
  brand: 'Brand guidelines', writing: 'Writing guidelines', product_examples: 'Product description examples', faq: 'Frequently asked questions', business: 'Business information'
};
const categoryLabel = (c) => CATEGORY_LABELS[c] || c;

const STARTER_INSTRUCTIONS = [
  ['Professional descriptions', 'Always write professional product descriptions.', 'product_descriptions'],
  ['Honest persuasion', 'Use persuasive but honest marketing language.', 'general'],
  ['No exaggeration', 'Avoid exaggerated claims.', 'general'],
  ['No invented specifications', 'Never invent product specifications.', 'general'],
  ['SEO-friendly titles', 'Use SEO-friendly product titles.', 'titles'],
  ['Easy to understand', 'Keep descriptions easy to understand.', 'product_descriptions'],
  ['Real benefits', 'Highlight the actual benefits of products.', 'product_descriptions'],
  ['Trustworthy tone', 'Use a professional and trustworthy tone.', 'general'],
  ['No commissions in copy', 'Do not mention affiliate commissions in product copy.', 'product_descriptions'],
  ['Brand voice', 'Always follow the SHEREBOY AFFILIATE CONCEPT brand voice.', 'general']
];

function viewFail(id, err) {
  document.getElementById(id).innerHTML = `<div class="panel">${emptyStateHTML(err.message, 'warning')}</div>`;
}

// ---------- Control centre ----------
async function loadAiCentreView() {
  const section = document.getElementById('view-ai');
  try {
    const { config, keys, capabilities, usage } = await API.get('/api/admin/ai/config');
    const providerRows = Object.entries(keys.providers).map(([id, p]) => `
      <div class="list-row">
        <span><b>${escapeHtml(p.label)}</b><br><span class="muted-cell">${p.configured ? `Key set (${p.source === 'dashboard' ? 'saved here, encrypted' : `server variable ${escapeHtml(p.envName)}`})` : `No key. Set ${escapeHtml(p.envName)} on the server${keys.canStoreKeys ? ' or save one here' : ''}.`}</span></span>
        <span class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-test="${id}" ${p.configured ? '' : 'disabled'}>Test connection</button>
          ${Permissions.can('ai.keys') && keys.canStoreKeys ? `<button type="button" class="btn btn-ghost btn-sm" data-set-key="${id}">${p.source === 'dashboard' ? 'Replace key' : 'Save a key'}</button>` : ''}
          ${Permissions.can('ai.keys') && p.source === 'dashboard' ? `<button type="button" class="btn btn-danger btn-sm" data-del-key="${id}">Remove</button>` : ''}
        </span>
      </div>`).join('');
    section.innerHTML = `
      <div class="panel"><h3 class="form-heading">Connection</h3>${providerRows}
        <p class="muted-cell" id="aiTestResult" role="status" style="margin-top:10px;"></p>
        ${keys.canStoreKeys ? '' : '<p class="muted-cell">To save keys from this page, set SETTINGS_ENCRYPTION_KEY on the server. Keys can always be set as server variables instead.</p>'}
      </div>
      <form id="aiConfigForm" novalidate>
        <div class="panel"><h3 class="form-heading">Model</h3><div class="form-grid">
          <div class="field"><label for="aiProvider">AI provider</label><select id="aiProvider" name="provider">${Object.entries(keys.providers).map(([id, p]) => `<option value="${id}" ${config.provider === id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="aiModel">Default model</label><input id="aiModel" name="model" list="aiModels" value="${escapeHtml(config.model)}" maxlength="100" /><datalist id="aiModels"></datalist><small class="help">Press "Test connection" to list the models your key can use.</small></div>
          <div class="field"><label for="aiMax">Maximum output length (tokens)</label><input id="aiMax" name="max_output_tokens" type="number" min="50" max="16000" value="${Number(config.max_output_tokens)}" /><small class="help">A ceiling, not a target. Some models spend much of this "thinking", so very low values cut answers short.</small></div>
          <div class="field"><label for="aiTemp">Creativity: <output id="aiTempValue">${Number(config.temperature)}</output></label><input id="aiTemp" name="temperature" type="range" min="0" max="1" step="0.1" value="${Number(config.temperature)}" /><small class="help">Lower is more predictable. Not every model supports this.</small></div>
        </div></div>
        <div class="panel"><h3 class="form-heading">Usage limits</h3>
          <p class="muted-cell" style="margin-bottom:10px;">Used this month: ${Number(usage.requests).toLocaleString()} requests, ${Number(usage.tokens).toLocaleString()} tokens. When a limit is reached, AI requests stop until next month. 0 means no limit.</p>
          <div class="form-grid">
          <div class="field"><label for="aiReqLimit">Monthly requests</label><input id="aiReqLimit" name="monthly_request_limit" type="number" min="0" value="${Number(config.monthly_request_limit)}" /></div>
          <div class="field"><label for="aiTokLimit">Monthly tokens</label><input id="aiTokLimit" name="monthly_token_limit" type="number" min="0" value="${Number(config.monthly_token_limit)}" /></div>
          <div class="field"><label for="aiPriceIn">Price per million input tokens</label><input id="aiPriceIn" name="price_input_per_million" type="number" min="0" step="0.01" value="${Number(config.price_input_per_million)}" /></div>
          <div class="field"><label for="aiPriceOut">Price per million output tokens</label><input id="aiPriceOut" name="price_output_per_million" type="number" min="0" step="0.01" value="${Number(config.price_output_per_million)}" /><small class="help">From your provider's price list. Used only to estimate costs in AI Activity.</small></div>
        </div></div>
        <div class="panel"><h3 class="form-heading">AI features</h3><p class="muted-cell" style="margin-bottom:10px;">Only what's switched on can be used anywhere.</p><div class="form-grid">
          ${Object.entries(capabilities).map(([id, label]) => `<label class="switch-row"><input type="checkbox" name="capability_${id}" ${config[`capability_${id}`] ? 'checked' : ''} /> <span>${escapeHtml(label)}</span></label>`).join('')}
        </div></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Save</button></div>
        <div class="form-msg" style="display:none;"></div>
      </form>
      <div class="panel"><h3 class="form-heading">Marketing copy writer</h3>
        <div class="field"><label for="aiCopyRequest">What do you need?</label><textarea id="aiCopyRequest" rows="2" maxlength="1000" placeholder="e.g. A short WhatsApp post about our smart door locks"></textarea></div>
        <button type="button" class="btn btn-ghost btn-sm" id="aiCopyRun">Write it</button>
        <div class="compare-box pre" id="aiCopyResult" hidden></div>
      </div>`;
    const form = document.getElementById('aiConfigForm');
    document.getElementById('aiTemp').addEventListener('input', (e) => { document.getElementById('aiTempValue').textContent = e.target.value; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      form.querySelectorAll('[name]').forEach((input) => {
        values[input.name] = input.type === 'checkbox' ? input.checked : input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value;
      });
      try {
        await API.put('/api/admin/ai/config', values);
        form.querySelector('.form-msg').style.display = 'none';
        toast('AI settings saved.');
        aiAvailable = null;
      } catch (err) {
        setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
      }
    });
    section.onclick = async (e) => {
      const test = e.target.closest('[data-test]');
      if (test) {
        const result = document.getElementById('aiTestResult');
        result.textContent = 'Testing…';
        test.disabled = true;
        try {
          const data = await API.post('/api/admin/ai/test', { provider: test.dataset.test });
          result.textContent = data.message;
          result.dataset.state = data.connected ? 'ok' : 'error';
          document.getElementById('aiModels').innerHTML = data.models.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('');
        } catch (err) { result.textContent = err.message; } finally { test.disabled = false; }
        return;
      }
      const setKey = e.target.closest('[data-set-key]');
      if (setKey) {
        openFormModal({
          title: `API key for ${keys.providers[setKey.dataset.setKey].label}`,
          fields: [{ name: 'key', label: 'API key', type: 'password', help: 'Encrypted on the server. It can’t be viewed again, only replaced.' }],
          onSave: async ({ key }) => {
            await API.put('/api/admin/ai/key', { provider: setKey.dataset.setKey, key });
            toast('Key saved.');
            aiAvailable = null;
            loadAiCentreView();
          }
        });
        return;
      }
      const delKey = e.target.closest('[data-del-key]');
      if (delKey && confirm('Remove this saved key?')) {
        try {
          await API.del(`/api/admin/ai/key/${delKey.dataset.delKey}`);
          aiAvailable = null;
          loadAiCentreView();
        } catch (err) { toast(err.message, 'error'); }
        return;
      }
      if (e.target.closest('#aiCopyRun')) {
        const box = document.getElementById('aiCopyResult');
        e.target.disabled = true;
        try {
          const { suggestion, flags } = await API.post('/api/admin/ai/generate', { action: 'marketing', instruction: document.getElementById('aiCopyRequest').value });
          box.hidden = false;
          box.textContent = suggestion + (flags.length ? `\n\nCheck before using: ${flags.join(', ')}` : '');
        } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
      }
    };
  } catch (err) { viewFail('view-ai', err); }
}

// ---------- Teach your AI ----------
async function fetchCategories() {
  const { instructionCategories, knowledgeCategories } = await API.get('/api/admin/ai/config');
  return { instructionCategories, knowledgeCategories };
}

async function loadTeachView() {
  const section = document.getElementById('view-teach');
  try {
    const [{ instructions }, { instructionCategories }] = await Promise.all([API.get('/api/admin/ai/instructions'), fetchCategories()]);
    const fields = [
      { name: 'title', label: 'Short name', max: 120, span: 1 },
      { name: 'category', label: 'Applies to', type: 'select', span: 1, options: instructionCategories.map((c) => [c, categoryLabel(c)]) },
      { name: 'body', label: 'Instruction', type: 'textarea', rows: 4, max: 4000 },
      { name: 'is_enabled', label: 'Enabled', type: 'checkbox' }
    ];
    const grouped = instructionCategories.map((c) => [c, instructions.filter((i) => i.category === c)]).filter(([, list]) => list.length);
    section.innerHTML = `
      <div class="panel-head"><h3>Your instructions</h3><div class="row-actions">
        ${instructions.length ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-starter>Add starter instructions</button>'}
        <button type="button" class="btn btn-primary btn-sm" data-new>${icon('plus')} Add instruction</button></div></div>
      <p class="muted-cell" style="margin-bottom:12px;">Saved here permanently and sent to the AI with every matching request. They can't override the built-in safety rules, such as never inventing specifications.</p>
      ${grouped.length ? grouped.map(([c, list]) => `<div class="panel"><h3 class="form-heading">${escapeHtml(categoryLabel(c))}</h3>${list.map((i) => `
        <div class="list-row${i.is_enabled ? '' : ' is-off'}">
          <span class="grow"><b>${escapeHtml(i.title)}</b><br>${escapeHtml(i.body)}</span>
          <span class="row-actions"><label class="switch-row" title="Enable or disable"><input type="checkbox" data-toggle="${Number(i.id)}" ${i.is_enabled ? 'checked' : ''} /> <span>On</span></label>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${Number(i.id)}">Edit</button><button type="button" class="btn btn-danger btn-sm" data-del="${Number(i.id)}">Delete</button></span>
        </div>`).join('')}</div>`).join('') : `<div class="panel">${emptyStateHTML('No instructions yet. Add your first one, or start with the suggested set.')}</div>`}
      <div class="panel"><h3 class="form-heading">Preview how the AI reads these</h3>
        <div class="form-grid">
          <div class="field"><label for="prevCapability">Kind of work</label><select id="prevCapability">${[['description', 'Product descriptions'], ['title', 'Titles'], ['seo', 'SEO'], ['marketing', 'Marketing'], ['email', 'Email'], ['assistant', 'Customer assistant']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <div class="field"><label for="prevSample">Sample product details (optional)</label><input id="prevSample" placeholder="e.g. Desk fan with 3 speeds and USB power" maxlength="2000" /></div>
        </div>
        <div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-show-prompt>Show the exact prompt</button><button type="button" class="btn btn-ghost btn-sm" data-ask-ai>Ask the AI</button></div>
        <div id="prevResult"></div>
      </div>`;
    const open = (item) => openFormModal({
      title: item ? 'Edit instruction' : 'Add instruction',
      fields,
      values: item || { category: 'general', is_enabled: true },
      onSave: async (v) => {
        if (item) await API.put(`/api/admin/ai/instructions/${item.id}`, v);
        else await API.post('/api/admin/ai/instructions', v);
        loadTeachView();
      }
    });
    const preview = async (run, button) => {
      const box = document.getElementById('prevResult');
      button.disabled = true;
      box.innerHTML = '<p class="muted-cell">Working…</p>';
      try {
        const data = await API.post('/api/admin/ai/instructions/preview', { capability: document.getElementById('prevCapability').value, sample: document.getElementById('prevSample').value, run });
        box.innerHTML = `${data.interpretation ? `<h4 class="prev-h">The AI's answer</h4><div class="compare-box pre">${/<[a-z]/i.test(data.interpretation) ? escapeHtml(data.interpretation.replace(/<[^>]+>/g, ' ')) : escapeHtml(data.interpretation)}</div>` : ''}
          <p class="muted-cell">${data.appliedInstructions.length} instruction${data.appliedInstructions.length === 1 ? '' : 's'} applied${data.usedKnowledge.length ? ` · knowledge used: ${data.usedKnowledge.map(escapeHtml).join(', ')}` : ''}</p>
          <details><summary>Exact prompt sent to the AI</summary><div class="compare-box pre">${escapeHtml(data.prompt)}</div></details>`;
      } catch (err) {
        box.innerHTML = emptyStateHTML(err.message, 'warning');
      } finally { button.disabled = false; }
    };
    section.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return open();
      const edit = e.target.closest('[data-edit]');
      if (edit) return open(instructions.find((i) => i.id === Number(edit.dataset.edit)));
      const del = e.target.closest('[data-del]');
      try {
        if (del && confirm('Delete this instruction?')) {
          await API.del(`/api/admin/ai/instructions/${del.dataset.del}`);
          return loadTeachView();
        }
        if (e.target.closest('[data-starter]')) {
          for (const [title, body, category] of STARTER_INSTRUCTIONS) await API.post('/api/admin/ai/instructions', { title, body, category });
          toast('Starter instructions added. Edit them to suit you.');
          return loadTeachView();
        }
      } catch (err) { toast(err.message, 'error'); }
      const show = e.target.closest('[data-show-prompt]');
      if (show) return preview(false, show);
      const ask = e.target.closest('[data-ask-ai]');
      if (ask) return preview(true, ask);
      return undefined;
    };
    section.onchange = async (e) => {
      if (e.target.dataset.toggle === undefined) return;
      const item = instructions.find((i) => i.id === Number(e.target.dataset.toggle));
      try {
        await API.put(`/api/admin/ai/instructions/${item.id}`, { ...item, is_enabled: e.target.checked });
        loadTeachView();
      } catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) { viewFail('view-teach', err); }
}

// ---------- Knowledge base ----------
async function loadKnowledgeView() {
  const section = document.getElementById('view-knowledge');
  try {
    const [{ entries }, { knowledgeCategories }] = await Promise.all([API.get('/api/admin/ai/knowledge'), fetchCategories()]);
    const fields = [
      { name: 'title', label: 'Title', max: 150, span: 1 },
      { name: 'category', label: 'Type', type: 'select', span: 1, options: knowledgeCategories.map((c) => [c, categoryLabel(c)]) },
      { name: 'body', label: 'Content', type: 'textarea', rows: 10 },
      { name: 'is_enabled', label: 'Approved for the AI to use', type: 'checkbox' }
    ];
    section.innerHTML = `
      <div class="panel-head"><h3>Knowledge entries</h3><div class="row-actions">
        <label class="btn btn-ghost btn-sm" tabindex="0">Upload document<input type="file" id="kbFile" accept=".txt,.md,.csv,.pdf" hidden /></label>
        <button type="button" class="btn btn-primary btn-sm" data-new>${icon('plus')} Add entry</button></div></div>
      <p class="muted-cell" style="margin-bottom:12px;">For each request the AI receives only the passages most relevant to it, marked as reference material. It's kept apart from your instructions and the safety rules. Documents can be TXT, Markdown, CSV or text-based PDF, up to 10 MB.</p>
      <div class="panel table-panel"><table><thead><tr><th>Entry</th><th>Type</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${entries.length ? entries.map((k) => `<tr>
        <td>${escapeHtml(k.title)}${k.source_filename ? `<br><span class="muted-cell">${escapeHtml(k.source_filename)}</span>` : ''}</td>
        <td>${escapeHtml(categoryLabel(k.category))}</td>
        <td class="num">${Number(k.body.length).toLocaleString()} chars</td>
        <td>${k.is_enabled ? '<span class="pill pill-green">Approved</span>' : '<span class="pill pill-gray">Off</span>'}</td>
        <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${Number(k.id)}">Edit</button><button class="btn btn-danger btn-sm" data-del="${Number(k.id)}">Delete</button></td></tr>`).join('') : emptyRow(5, 'Nothing here yet. Add your brand guidelines, writing rules or example descriptions.')}
      </tbody></table></div>`;
    const open = (item) => openFormModal({
      title: item ? 'Edit entry' : 'Add entry',
      fields,
      values: item || { category: 'brand', is_enabled: true },
      onSave: async (v) => {
        if (item) await API.put(`/api/admin/ai/knowledge/${item.id}`, v);
        else await API.post('/api/admin/ai/knowledge', v);
        loadKnowledgeView();
      }
    });
    document.getElementById('kbFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      form.append('category', 'general');
      try {
        const { entry, truncated } = await API.upload('/api/admin/ai/knowledge/upload', form);
        toast(truncated ? `Added "${entry.title}" (shortened: it was very long).` : `Added "${entry.title}". Check its type and text.`);
        loadKnowledgeView();
      } catch (err) { toast(err.message, 'error'); }
    });
    section.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return open();
      const edit = e.target.closest('[data-edit]');
      if (edit) return open(entries.find((k) => k.id === Number(edit.dataset.edit)));
      const del = e.target.closest('[data-del]');
      if (del && confirm('Delete this entry?')) {
        try {
          await API.del(`/api/admin/ai/knowledge/${del.dataset.del}`);
          loadKnowledgeView();
        } catch (err) { toast(err.message, 'error'); }
      }
      return undefined;
    };
  } catch (err) { viewFail('view-knowledge', err); }
}

// ---------- Activity ----------
function limitMeter(label, used, limit) {
  if (!limit) return `<div class="meter"><span>${escapeHtml(label)}: ${Number(used).toLocaleString()} (no limit)</span></div>`;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return `<div class="meter${percent >= 80 ? ' warn' : ''}"><span>${escapeHtml(label)}: ${Number(used).toLocaleString()} of ${Number(limit).toLocaleString()}${percent >= 80 ? ' · nearly used up' : ''}</span><div class="meter-track"><div class="meter-fill" style="width:${percent}%"></div></div></div>`;
}

async function loadAiActivityView() {
  const section = document.getElementById('view-ai-activity');
  try {
    const { totals, features, models, month, recent, days } = await API.get('/api/admin/ai/activity');
    const stat = (value, label) => `<div class="stat-card"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
    const bars = (rows) => {
      const max = Math.max(1, ...rows.map((r) => r.count));
      return rows.length ? rows.map((r) => `<div class="bar-row"><span>${escapeHtml(r.name)}</span><div class="meter-track"><div class="meter-fill" style="width:${(r.count / max) * 100}%"></div></div><b>${r.count}</b></div>`).join('') : '<p class="muted-cell">Nothing yet.</p>';
    };
    section.innerHTML = `
      <p class="muted-cell" style="margin-bottom:12px;">Last ${days} days.</p>
      <div class="stat-grid">
        ${stat(totals.requests.toLocaleString(), 'Total requests')}
        ${stat(totals.success.toLocaleString(), 'Successful')}
        ${stat(totals.failed.toLocaleString(), 'Failed')}
        ${stat(totals.blocked.toLocaleString(), 'Blocked by limits')}
        ${stat((totals.inputTokens + totals.outputTokens).toLocaleString(), 'Tokens used')}
        ${stat(totals.estimatedCost === null ? 'Not set' : `$${totals.estimatedCost.toFixed(4)}`, 'Estimated cost')}
      </div>
      <div class="panel"><h3 class="form-heading">This month's limits</h3>${limitMeter('Requests', month.requests, month.requestLimit)}${limitMeter('Tokens', month.tokens, month.tokenLimit)}</div>
      <div class="panel"><h3 class="form-heading">Most used features</h3>${bars(features.slice(0, 10))}</div>
      <div class="panel"><h3 class="form-heading">Models</h3>${bars(models)}</div>
      <div class="panel table-panel"><table><thead><tr><th>When</th><th>Feature</th><th>Model</th><th>Status</th><th>Tokens</th><th>By</th></tr></thead><tbody>
      ${recent.length ? recent.map((r) => `<tr>
        <td class="muted-cell">${new Date(r.created_at).toLocaleString()}</td>
        <td>${escapeHtml(r.action || r.feature)}</td>
        <td>${escapeHtml(r.model || '—')}</td>
        <td><span class="pill ${r.status === 'success' ? 'pill-green' : r.status === 'blocked' ? 'pill-gold' : 'pill-red'}">${escapeHtml(r.status)}</span>${r.error ? `<br><span class="muted-cell">${escapeHtml(r.error)}</span>` : ''}</td>
        <td class="num">${Number(r.input_tokens) + Number(r.output_tokens)}</td>
        <td class="muted-cell">${escapeHtml(r.actor_email || 'Visitor')}</td></tr>`).join('') : emptyRow(6, 'No AI requests yet.')}
      </tbody></table></div>`;
  } catch (err) { viewFail('view-ai-activity', err); }
}
