// admin/js/product-editor.js
// Add and edit products. Every change autosaves to a private draft; visitors keep
// seeing the published version until someone presses Publish. AI suggestions
// appear beside the original and change nothing until they are accepted.

const STATUS_LABELS = { draft: 'Draft', pending_review: 'Pending review', published: 'Published', scheduled: 'Scheduled', archived: 'Archived' };
const STATUS_PILLS = { draft: 'pill-gray', pending_review: 'pill-gold', published: 'pill-green', scheduled: 'pill-blue', archived: 'pill-gray' };
const AI_TOOLS = [
  ['improve', 'Improve Writing'], ['grammar', 'Fix Grammar'], ['rewrite', 'Rewrite'], ['persuasive', 'Make It Persuasive'], ['shorten', 'Shorten'],
  ['expand', 'Expand'], ['seo', 'SEO Optimize'], ['benefits', 'Generate Benefits'], ['bullets', 'Generate Bullet Points'], ['custom', 'Custom Instruction']
];
const AUTOSAVE_MS = 2000;

let editor = null; // the product currently open

// ---------- The list ----------
const productFilter = { status: '', q: '', page: 1 };

function statusPill(status) {
  return `<span class="pill ${STATUS_PILLS[status] || 'pill-gray'}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

async function loadProducts() {
  const params = new URLSearchParams({ perPage: 50, page: productFilter.page });
  if (productFilter.status) params.set('status', productFilter.status);
  if (productFilter.q) params.set('q', productFilter.q);
  try {
    const { items, counts, totalPages, page } = await API.get(`/api/admin/products?${params}`);
    const all = Object.values(counts).reduce((a, b) => a + b, 0);
    document.getElementById('productStatusTabs').innerHTML = [['', 'All', all], ...Object.entries(STATUS_LABELS).map(([k, label]) => [k, label, counts[k] || 0])]
      .map(([key, label, count]) => `<button type="button" class="tab-btn${productFilter.status === key ? ' active' : ''}" data-status="${key}">${escapeHtml(label)} (${count})</button>`).join('');
    const body = document.getElementById('productsTableBody');
    body.innerHTML = items.length ? items.map((p) => `
      <tr>
        <td class="product-cell"><img class="table-thumb" src="${escapeHtml((p.images && p.images[0]) || '/images/placeholder-product.svg')}" alt="" loading="lazy" />
          <span>${escapeHtml(String(p.name).trim())}${p.images_missing ? '<br><span class="pill pill-red">Image missing</span>' : ''}${p.has_draft ? '<br><span class="pill pill-gold">Unpublished changes</span>' : ''}</span></td>
        <td>${escapeHtml(p.category_name || 'Uncategorized')}</td>
        <td class="num">${formatNaira(p.final_price)}</td>
        <td>${statusPill(p.status)}${p.publish_at ? `<br><span class="muted-cell">${formatDateTime(p.publish_at)}</span>` : ''}</td>
        <td>${p.is_featured ? '<span class="pill pill-gold">Featured</span> ' : ''}${p.is_deal ? '<span class="pill pill-blue">Deal</span> ' : ''}${p.is_verified ? '<span class="pill pill-green">Verified</span>' : ''}</td>
        <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit-product="${Number(p.id)}">Edit</button></td>
      </tr>`).join('') : emptyRow(6, productFilter.status || productFilter.q ? 'No products match.' : 'No products yet. Click "Add product" to create your first one.');
    document.getElementById('productPager').innerHTML = pagerHTML(page, totalPages, 'products');
  } catch (err) {
    document.getElementById('productsTableBody').innerHTML = emptyRow(6, err.message, 'warning');
  }
}

// ---------- The editor ----------
function editorMarkup(p) {
  const canPublish = Permissions.can('products.publish');
  return `
  <div class="editor-bar">
    <button type="button" class="btn btn-ghost btn-sm" data-back>${icon('arrow-left')} All products</button>
    <span id="editorStatus"></span>
    <span class="autosave" id="autosaveState" role="status"></span>
    <span class="editor-actions" id="editorActions"></span>
  </div>
  <div class="alert" id="editorErrors" hidden></div>
  <div class="editor-grid">
    <div class="editor-main">
      <div class="panel">
        <div class="field" data-field="name">
          <label for="pName">Product title <button type="button" class="ai-mini" data-ai-field="title">✦ Suggest</button></label>
          <input id="pName" name="name" maxlength="200" value="${escapeHtml(p.name && !/^Untitled product/.test(p.name) ? p.name.trim() : '')}" />
        </div>
        <div class="field" data-field="short_description">
          <label for="pShort">Short description <button type="button" class="ai-mini" data-ai-field="summary">✦ Suggest</button></label>
          <textarea id="pShort" name="short_description" rows="2" maxlength="500">${escapeHtml(p.short_description || '')}</textarea>
        </div>
      </div>
      <div class="panel" data-field="description">
        <div class="panel-head"><h3>Full description</h3><button type="button" class="ai-mini" data-ai-tool="describe">✦ Write from product details</button></div>
        <div id="pDescriptionEditor"></div>
        <div class="ai-toolbar" id="aiToolbar"></div>
        <p class="muted-cell" style="margin-top:8px;">Select part of the text to improve just that part, or use a tool with nothing selected to work on all of it. Suggestions never change your text until you accept them.</p>
      </div>
      <div class="panel" data-field="images">
        <div class="panel-head"><h3>Images</h3><button type="button" class="btn btn-ghost btn-sm" id="pChooseImages">Choose from Media Library</button></div>
        <div class="gallery" id="pGallery"></div>
        <p class="muted-cell">The first image is the main picture. The others form the gallery.</p>
      </div>
      <div class="panel" data-field="specifications">
        <div class="panel-head"><h3>Product attributes</h3><button type="button" class="btn btn-ghost btn-sm" id="pAddSpec">${icon('plus')} Add attribute</button></div>
        <div id="specRows"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Search engine listing</h3><button type="button" class="ai-mini" data-ai-field="seo_meta">✦ Suggest both</button></div>
        <div class="field" data-field="seo_title"><label for="pSeoTitle">SEO title</label><input id="pSeoTitle" name="seo_title" maxlength="120" value="${escapeHtml(p.seo_title || '')}" /><small class="help">Leave empty to use the product title.</small></div>
        <div class="field" data-field="seo_description"><label for="pSeoDesc">SEO description</label><textarea id="pSeoDesc" name="seo_description" rows="2" maxlength="320">${escapeHtml(p.seo_description || '')}</textarea><small class="help">Leave empty to use the short description.</small></div>
      </div>
    </div>
    <div class="editor-side">
      <div class="panel">
        <h3 class="form-heading">Price</h3>
        <div class="form-grid">
          <div class="field" data-field="price"><label for="pPrice">Price (before discount)</label><input id="pPrice" name="price" type="number" min="0" step="0.01" value="${p.price ? escapeHtml(p.price) : ''}" /></div>
          <div class="field" data-field="discount_percent"><label for="pDiscount">Discount %</label><input id="pDiscount" name="discount_percent" type="number" min="0" max="100" step="0.01" value="${escapeHtml(p.discount_percent ?? 0)}" /></div>
        </div>
        <p class="muted-cell" id="pFinalPrice"></p>
        <div class="field" data-field="affiliate_link"><label for="pLink">Affiliate URL</label><input id="pLink" name="affiliate_link" type="url" placeholder="https://…" value="${escapeHtml(p.affiliate_link || '')}" /></div>
      </div>
      <div class="panel">
        <h3 class="form-heading">Organise</h3>
        <div class="field" data-field="category_id"><label for="pCategory">Category <button type="button" class="ai-mini" data-ai-field="categorize">✦ Suggest</button></label><select id="pCategory" name="category_id"><option value="">Uncategorized</option>${allCategories.map((c) => `<option value="${Number(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field" data-field="availability"><label for="pAvailability">Availability</label><select id="pAvailability" name="availability">${[['in_stock', 'In stock'], ['limited', 'Limited stock'], ['out_of_stock', 'Out of stock']].map(([v, l]) => `<option value="${v}" ${p.availability === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <label class="switch-row"><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''} /> <span>Featured</span></label>
        <label class="switch-row"><input type="checkbox" name="is_deal" ${p.is_deal ? 'checked' : ''} /> <span>Deal</span></label>
        <label class="switch-row"><input type="checkbox" name="is_verified" ${p.is_verified ? 'checked' : ''} /> <span>Verified deal: I checked this price on the retailer’s page</span></label>
      </div>
      <div class="panel">
        <h3 class="form-heading">Rating</h3>
        <p class="muted-cell">Only enter real figures from the retailer. Leave empty otherwise.</p>
        <div class="form-grid">
          <div class="field" data-field="rating"><label for="pRating">Rating (0-5)</label><input id="pRating" name="rating" type="number" min="0" max="5" step="0.1" value="${p.rating ?? ''}" /></div>
          <div class="field" data-field="rating_count"><label for="pRatingCount">Number of ratings</label><input id="pRatingCount" name="rating_count" type="number" min="0" step="1" value="${p.rating_count ?? ''}" /></div>
        </div>
      </div>
      ${canPublish ? `<div class="panel" id="schedulePanel">
        <h3 class="form-heading">Schedule</h3>
        <div class="field"><label for="pPublishAt">Publish on</label><input id="pPublishAt" type="datetime-local" /></div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="schedule">Schedule</button>
      </div>` : ''}
    </div>
  </div>`;
}

function collectFields() {
  const root = document.getElementById('view-product-editor');
  const value = (n) => root.querySelector(`[name="${n}"]`).value;
  const checked = (n) => root.querySelector(`[name="${n}"]`).checked;
  const specs = {};
  root.querySelectorAll('.spec-row').forEach((row) => {
    const key = row.querySelector('.spec-key').value.trim();
    if (key) specs[key] = row.querySelector('.spec-value').value.trim();
  });
  return {
    name: value('name'),
    short_description: value('short_description'),
    description: editor.rich.getHTML(),
    price: value('price'),
    discount_percent: value('discount_percent'),
    affiliate_link: value('affiliate_link').trim(),
    category_id: value('category_id'),
    availability: value('availability'),
    is_featured: checked('is_featured'),
    is_deal: checked('is_deal'),
    is_verified: checked('is_verified'),
    rating: value('rating'),
    rating_count: value('rating_count'),
    specifications: specs,
    images: editor.images,
    seo_title: value('seo_title'),
    seo_description: value('seo_description')
  };
}

function setAutosave(text, type = '') {
  const el = document.getElementById('autosaveState');
  if (el) {
    el.textContent = text;
    el.dataset.state = type;
  }
}

function drawGallery() {
  document.getElementById('pGallery').innerHTML = editor.images.length ? editor.images.map((url, i) => `
    <div class="gallery-item">
      <img src="${escapeHtml(url.replace(/(\/opt-[^/]+)\.webp$/, '$1-w480.webp'))}" alt="" />
      ${i === 0 ? '<span class="gallery-main">Main</span>' : ''}
      <div class="gallery-tools">
        <button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">‹</button>
        <button type="button" data-remove-image="${i}" aria-label="Remove image">${icon('close')}</button>
        <button type="button" data-move="${i}" data-dir="1" ${i === editor.images.length - 1 ? 'disabled' : ''} aria-label="Move later">›</button>
      </div>
    </div>`).join('') : '<p class="muted-cell">No images yet.</p>';
}

function addSpecRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `<input class="spec-key" placeholder="Name (e.g. Colour)" maxlength="100" value="${escapeHtml(key)}" />
    <input class="spec-value" placeholder="Value (e.g. Silver)" maxlength="500" value="${escapeHtml(value)}" />
    <button type="button" class="btn btn-ghost btn-sm" data-remove-spec aria-label="Remove attribute">${icon('close')}</button>`;
  document.getElementById('specRows').append(row);
}

function updateFinalPrice() {
  const root = document.getElementById('view-product-editor');
  const price = Number(root.querySelector('[name="price"]').value) || 0;
  const discount = Number(root.querySelector('[name="discount_percent"]').value) || 0;
  document.getElementById('pFinalPrice').textContent = price ? `Visitors see ${formatNaira(price * (1 - discount / 100))}${discount > 0 ? ` (was ${formatNaira(price)})` : ''}` : '';
}

function drawActions() {
  const { status, has_draft: hasDraft } = editor;
  const canPublish = Permissions.can('products.publish');
  const live = status === 'published';
  const buttons = [`<button type="button" class="btn btn-ghost btn-sm" data-action="preview">Preview</button>`];
  if (hasDraft && live) buttons.push('<button type="button" class="btn btn-ghost btn-sm" data-action="discard">Discard changes</button>');
  if (!live && status !== 'pending_review') buttons.push('<button type="button" class="btn btn-ghost btn-sm" data-action="review">Request review</button>');
  if (canPublish) {
    if (live) buttons.push('<button type="button" class="btn btn-ghost btn-sm" data-action="unpublish">Unpublish</button>');
    if (status !== 'archived') buttons.push('<button type="button" class="btn btn-ghost btn-sm" data-action="archive">Archive</button>');
    if (status === 'archived') buttons.push('<button type="button" class="btn btn-ghost btn-sm" data-action="unpublish">Move to drafts</button>');
    buttons.push(`<button type="button" class="btn btn-primary btn-sm" data-action="publish">${live ? 'Publish changes' : 'Publish'}</button>`);
    if (editor.id) buttons.push('<button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>');
  }
  document.getElementById('editorActions').innerHTML = buttons.join('');
  document.getElementById('editorStatus').innerHTML = statusPill(status) + (hasDraft && live ? ' <span class="pill pill-gold">Unpublished changes</span>' : '') + (editor.publish_at ? ` <span class="muted-cell">for ${formatDateTime(editor.publish_at)}</span>` : '');
}

function queueAutosave() {
  if (!editor) return;
  editor.dirty = true;
  setAutosave('Unsaved changes…');
  clearTimeout(editor.timer);
  editor.timer = setTimeout(saveDraftNow, AUTOSAVE_MS);
}

async function saveDraftNow() {
  if (!editor) return true;
  clearTimeout(editor.timer);
  // One save at a time. Whatever changed during it is saved straight afterwards.
  if (editor.saving) await editor.saving;
  if (!editor || !editor.dirty) return true;
  editor.dirty = false;
  const current = editor;
  setAutosave('Saving…');
  current.saving = (async () => {
    try {
      const fields = collectFields();
      if (!current.id) {
        const { id } = await API.post('/api/admin/products', {});
        current.id = id;
        history.replaceState(null, '', `#product-${id}`);
      }
      const { draft_saved_at: savedAt } = await API.put(`/api/admin/products/${current.id}/draft`, fields);
      current.has_draft = true;
      setAutosave(`Saved ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'ok');
      if (editor === current) drawActions();
      showFieldErrors({});
      return true;
    } catch (err) {
      current.dirty = true;
      setAutosave(`Not saved: ${err.message}`, 'error');
      showFieldErrors((err.data && err.data.fieldErrors) || {});
      return false;
    } finally {
      current.saving = null;
    }
  })();
  const saved = await current.saving;
  if (saved && current.dirty && editor === current) current.timer = setTimeout(saveDraftNow, AUTOSAVE_MS);
  return saved;
}

function showFieldErrors(errors) {
  const root = document.getElementById('view-product-editor');
  root.querySelectorAll('.field-error').forEach((el) => el.remove());
  root.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
  Object.entries(errors).forEach(([field, message]) => {
    const wrap = root.querySelector(`[data-field="${field}"]`);
    if (!wrap) return;
    wrap.classList.add('has-error');
    const note = document.createElement('small');
    note.className = 'field-error';
    note.textContent = message;
    wrap.append(note);
  });
  const box = document.getElementById('editorErrors');
  const list = Object.values(errors);
  box.hidden = !list.length;
  box.innerHTML = list.length ? `${icon('warning')}<div><b>Please fix these before publishing:</b><ul>${list.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : '';
  if (list.length) box.scrollIntoView({ block: 'nearest' });
}

async function openProductEditor(id) {
  await flushEditor();
  showView('product-editor', id ? 'Edit product' : 'Add product');
  const section = document.getElementById('view-product-editor');
  section.innerHTML = '<div class="panel"><span class="muted-cell">Loading…</span></div>';
  if (!allCategories.length) await loadCategories();

  let product = { status: 'draft', availability: 'in_stock', images: [], specifications: {}, discount_percent: 0, description: '', description_format: 'html' };
  if (id) {
    try {
      product = (await API.get(`/api/admin/products/${id}`)).product;
    } catch (err) {
      section.innerHTML = `<div class="panel">${emptyStateHTML(err.message, 'warning')}</div>`;
      return;
    }
  }
  editor = { id: id || null, status: product.status, publish_at: product.publish_at, has_draft: product.has_draft, images: [...(product.images || [])], dirty: false, timer: null, saving: null };
  section.innerHTML = editorMarkup(product);
  editor.rich = new RichEditor(document.getElementById('pDescriptionEditor'), { onChange: queueAutosave });
  // Older descriptions are plain text; drafts and new ones are formatted
  editor.rich.setHTML(product.description_format === 'html' || /<[a-z][^>]*>/i.test(product.description || '') ? product.description : plainTextToHtml(product.description));

  Object.entries(product.specifications || {}).forEach(([k, v]) => addSpecRow(k, v));
  if (!Object.keys(product.specifications || {}).length) addSpecRow();
  drawGallery();
  updateFinalPrice();
  drawActions();
  setAutosave(product.draft_saved_at ? `Draft saved ${formatDateTime(product.draft_saved_at)}` : '');
  drawAiToolbar();

  section.oninput = (e) => {
    if (e.target.closest('.re')) return;
    if (['price', 'discount_percent'].includes(e.target.name)) updateFinalPrice();
    if (e.target.id !== 'pPublishAt') queueAutosave();
  };
  section.onchange = (e) => { if (e.target.matches('select, input[type=checkbox]')) queueAutosave(); };
  section.onclick = onEditorClick;
}

/** Saves anything pending before the editor's contents are replaced or left. */
async function flushEditor() {
  if (editor && (editor.dirty || editor.saving)) await saveDraftNow();
}

async function onEditorClick(e) {
  if (e.target.closest('[data-back]')) {
    await flushEditor();
    editor = null;
    location.hash = '#products';
    return;
  }
  const move = e.target.closest('[data-move]');
  if (move) {
    const i = Number(move.dataset.move);
    const j = i + Number(move.dataset.dir);
    [editor.images[i], editor.images[j]] = [editor.images[j], editor.images[i]];
    drawGallery();
    queueAutosave();
    return;
  }
  const removeImage = e.target.closest('[data-remove-image]');
  if (removeImage) {
    editor.images.splice(Number(removeImage.dataset.removeImage), 1);
    drawGallery();
    queueAutosave();
    return;
  }
  if (e.target.closest('#pChooseImages')) {
    const items = await MediaPicker.open({ kind: 'image', multiple: true });
    items.forEach((item) => { if (!editor.images.includes(item.url)) editor.images.push(item.url); });
    if (items.length) {
      drawGallery();
      queueAutosave();
    }
    return;
  }
  if (e.target.closest('#pAddSpec')) return addSpecRow();
  const removeSpec = e.target.closest('[data-remove-spec]');
  if (removeSpec) {
    removeSpec.parentElement.remove();
    queueAutosave();
    return;
  }
  const action = e.target.closest('[data-action]');
  if (action) return editorAction(action.dataset.action, action);
  const tool = e.target.closest('[data-ai-tool]');
  if (tool) return runAiTool(tool.dataset.aiTool, tool);
  const fieldTool = e.target.closest('[data-ai-field]');
  if (fieldTool) return runFieldTool(fieldTool.dataset.aiField, fieldTool);
  return undefined;
}

async function editorAction(action, button) {
  // The toolbar keeps its place; a slow request shouldn't allow a second click
  button.disabled = true;
  try {
    if (action === 'preview') {
      editor.dirty = editor.dirty || !editor.id;
      await openAfterSaving(async () => ((await saveDraftNow()) ? `/product-details.html?preview=${editor.id}` : null));
      return;
    }
    if (editor.dirty || editor.saving || !editor.id) {
      editor.dirty = editor.dirty || !editor.id;
      if (!(await saveDraftNow())) return;
    }
    if (action === 'publish') {
      const { message } = await API.post(`/api/admin/products/${editor.id}/publish`, {});
      showFieldErrors({});
      editor.status = 'published';
      editor.has_draft = false;
      editor.publish_at = null;
      toast(message);
    } else if (action === 'schedule') {
      const when = document.getElementById('pPublishAt').value;
      if (!when) return toast('Choose a date and time first.', 'error');
      await API.post(`/api/admin/products/${editor.id}/status`, { status: 'scheduled', publish_at: new Date(when).toISOString() });
      editor.status = 'scheduled';
      editor.has_draft = false;
      editor.publish_at = new Date(when).toISOString();
      showFieldErrors({});
      toast('Scheduled.');
    } else if (action === 'review') {
      await API.post(`/api/admin/products/${editor.id}/status`, { status: 'pending_review' });
      editor.status = 'pending_review';
      toast('Sent for review.');
    } else if (action === 'unpublish' || action === 'archive') {
      if (!confirm(action === 'archive' ? 'Archive this product? It leaves the website but is kept here.' : 'Take this product off the website and move it to drafts?')) return;
      const status = action === 'archive' ? 'archived' : 'draft';
      await API.post(`/api/admin/products/${editor.id}/status`, { status });
      editor.status = status;
      editor.publish_at = null;
      toast('Status updated.');
    } else if (action === 'discard') {
      if (!confirm('Discard all unpublished changes and go back to the published version?')) return;
      await API.del(`/api/admin/products/${editor.id}/draft`);
      toast('Changes discarded.');
      return openProductEditor(editor.id);
    } else if (action === 'delete') {
      if (!confirm('Delete this product permanently? This can’t be undone.')) return;
      await API.del(`/api/admin/products/${editor.id}`);
      toast('Product deleted.');
      editor = null;
      location.hash = '#products';
      return;
    }
    drawActions();
  } catch (err) {
    if (err.data && err.data.fieldErrors) showFieldErrors(err.data.fieldErrors);
    else toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

// ---------- AI ----------
let aiAvailable = null;

async function drawAiToolbar() {
  const bar = document.getElementById('aiToolbar');
  if (!Permissions.can('ai.use')) {
    bar.innerHTML = '';
    return;
  }
  try {
    if (!aiAvailable) aiAvailable = await API.get('/api/admin/ai/available');
  } catch (err) {
    bar.innerHTML = `<span class="muted-cell">${escapeHtml(err.message)}</span>`;
    return;
  }
  if (!aiAvailable.configured) {
    bar.innerHTML = '<span class="muted-cell">AI tools appear here once a provider is connected in the AI Control Centre.</span>';
    document.querySelectorAll('.ai-mini').forEach((b) => { b.hidden = true; });
    return;
  }
  const tools = AI_TOOLS.filter(([id]) => aiAvailable.actions[id]);
  bar.innerHTML = `<span class="ai-toolbar-label">✦ AI</span>${tools.map(([id, label]) => `<button type="button" class="btn btn-ghost btn-sm" data-ai-tool="${id}">${escapeHtml(label)}</button>`).join('')}`;
  document.querySelectorAll('[data-ai-field], [data-ai-tool="describe"]').forEach((b) => { b.hidden = !aiAvailable.actions[b.dataset.aiField || b.dataset.aiTool]; });
}

// Toolbar buttons take focus; remember the selection the moment the mouse goes down
const rememberAiSelection = (e) => {
  if (editor && editor.rich && e.target.closest && e.target.closest('[data-ai-tool]')) editor.rich.captureSelection();
};
document.addEventListener('mousedown', rememberAiSelection);
document.addEventListener('touchstart', rememberAiSelection, { passive: true });

function productContext() {
  const f = collectFields();
  const category = allCategories.find((c) => String(c.id) === String(f.category_id));
  return {
    name: f.name,
    short_description: f.short_description,
    description: f.description,
    price: f.price,
    discount_percent: f.discount_percent,
    specifications: f.specifications,
    category: category && category.name,
    categories: allCategories.map((c) => c.name)
  };
}

async function askAi(body) {
  return API.post('/api/admin/ai/generate', body);
}

function flagsNote(data) {
  if (!data.flags || !data.flags.length) return '';
  return `<div class="alert">${icon('warning')}<div><b>Check these before accepting.</b> They aren’t in your original text or product details: ${data.flags.map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}</div></div>`;
}

async function runAiTool(action, button) {
  const rich = editor.rich;
  const usingSelection = action !== 'describe' && !!rich.savedRange;
  let instruction = '';
  if (action === 'custom') {
    instruction = await askInstruction();
    if (!instruction) return;
  }
  const original = usingSelection ? rich.selectedHTML() : rich.getHTML();
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Working…';
  try {
    const data = await askAi({ action, text: action === 'describe' ? '' : original, instruction, product: productContext() });
    showSuggestion({ action, original, data, instruction, usingSelection });
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function askInstruction() {
  return new Promise((resolve) => {
    let answered = false;
    const modal = openModal({
      title: 'Custom instruction',
      onClose: () => { if (!answered) resolve(''); },
      body: `<form novalidate><div class="field"><label for="aiCustomInstruction">What should the AI change?</label><textarea id="aiCustomInstruction" rows="3" maxlength="1000" placeholder="e.g. Start with the main benefit and keep it under 80 words"></textarea></div><div class="modal-actions"><button type="submit" class="btn btn-primary">Ask AI</button></div></form>`
    });
    const form = modal.body.querySelector('form');
    form.querySelector('textarea').focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      answered = true;
      resolve(form.querySelector('textarea').value.trim());
      modal.close();
    });
  });
}

/** Original and suggestion side by side. Nothing changes until "Accept". */
function showSuggestion({ action, original, data, instruction, usingSelection }) {
  const modal = openModal({
    title: 'Review the AI suggestion',
    wide: true,
    body: `${flagsNote(data)}${data.truncated ? `<div class="alert">${icon('warning')}<span>This answer was cut off by the maximum output length. Raise it in the AI Control Centre, or work on a smaller selection.</span></div>` : ''}
      <div class="compare">
        <div><h4>Original ${usingSelection ? '(selected text)' : ''}</h4><div class="compare-box">${original || '<em>Empty</em>'}</div></div>
        <div><h4>Suggestion <small>you can edit this</small></h4><div class="compare-box" contenteditable="true" data-suggestion role="textbox" aria-multiline="true">${data.suggestion}</div></div>
      </div>
      <p class="muted-cell">${escapeHtml(data.model)} · ${data.appliedInstructions.length} instruction${data.appliedInstructions.length === 1 ? '' : 's'} applied${data.usedKnowledge.length ? ` · knowledge used: ${data.usedKnowledge.map(escapeHtml).join(', ')}` : ''}</p>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-accept>Accept</button><button type="button" class="btn btn-ghost" data-retry-ai>Try again</button><button type="button" class="btn btn-ghost" data-reject>Reject</button></div>`
  });
  modal.body.querySelector('[data-accept]').addEventListener('click', () => {
    editor.rich.applySuggestion(modal.body.querySelector('[data-suggestion]').innerHTML);
    modal.close();
    toast('Added to your draft. Visitors still see the published version until you publish.');
  });
  modal.body.querySelector('[data-reject]').addEventListener('click', () => {
    editor.rich.savedRange = null;
    modal.close();
  });
  modal.body.querySelector('[data-retry-ai]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const again = await askAi({ action, text: action === 'describe' ? '' : original, instruction, product: productContext() });
      modal.body.querySelector('[data-suggestion]').innerHTML = again.suggestion;
    } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
  });
}

/** Title, summary, SEO and category suggestions: shown first, filled in on acceptance. */
async function runFieldTool(action, button) {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Working…';
  const root = document.getElementById('view-product-editor');
  try {
    const data = await askAi({ action, product: productContext() });
    const apply = {
      title: () => { root.querySelector('[name="name"]').value = data.suggestion; },
      summary: () => { root.querySelector('[name="short_description"]').value = data.suggestion; },
      seo_meta: () => {
        root.querySelector('[name="seo_title"]').value = data.fields.seo_title || '';
        root.querySelector('[name="seo_description"]').value = data.fields.seo_description || '';
      },
      categorize: () => {
        const match = allCategories.find((c) => c.name === data.fields.category);
        if (match) root.querySelector('[name="category_id"]').value = match.id;
      }
    }[action];
    let current, proposal;
    if (action === 'title') { current = root.querySelector('[name="name"]').value; proposal = data.suggestion; }
    if (action === 'summary') { current = root.querySelector('[name="short_description"]').value; proposal = data.suggestion; }
    if (action === 'seo_meta') { current = `${root.querySelector('[name="seo_title"]').value}\n${root.querySelector('[name="seo_description"]').value}`; proposal = `${data.fields.seo_title}\n${data.fields.seo_description}`; }
    if (action === 'categorize') {
      const known = allCategories.some((c) => c.name === data.fields.category);
      if (!known) return toast(`The AI suggested "${data.fields.category}", which isn't one of your categories.`, 'error');
      current = root.querySelector('[name="category_id"]').selectedOptions[0].textContent;
      proposal = `${data.fields.category}\n\n${data.fields.reason || ''}`;
    }
    const modal = openModal({
      title: 'Review the AI suggestion',
      wide: true,
      body: `${flagsNote(data)}<div class="compare">
        <div><h4>Current</h4><div class="compare-box pre">${escapeHtml(current) || '<em>Empty</em>'}</div></div>
        <div><h4>Suggestion</h4><div class="compare-box pre">${escapeHtml(proposal)}</div></div></div>
        <div class="modal-actions"><button type="button" class="btn btn-primary" data-accept>Accept</button><button type="button" class="btn btn-ghost" data-reject>Reject</button></div>`
    });
    modal.body.querySelector('[data-accept]').addEventListener('click', () => {
      apply();
      queueAutosave();
      modal.close();
    });
    modal.body.querySelector('[data-reject]').addEventListener('click', modal.close);
    return undefined;
  } catch (err) {
    return toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// Don't lose work on leaving the page
window.addEventListener('beforeunload', (e) => {
  if (editor && editor.dirty) {
    saveDraftNow();
    e.preventDefault();
  }
});
