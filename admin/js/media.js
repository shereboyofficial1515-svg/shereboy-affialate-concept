// admin/js/media.js
// The Media Library view, and the picker that opens from products, settings,
// banners and categories. Both use the same browser, upload queue and API.

const MAX_SIZES = { 'image/svg+xml': 2, 'application/pdf': 20, 'video/mp4': 50, 'video/webm': 50 };
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,application/pdf';

let mediaFolders = [];

async function loadFolders() {
  const { folders } = await API.get('/api/admin/media/folders');
  mediaFolders = folders;
  return folders;
}

function mediaThumb(item) {
  if (item.kind === 'image') return `<img src="${escapeHtml(item.thumb_url || item.url)}" alt="${escapeHtml(item.alt_text || '')}" loading="lazy" decoding="async" />`;
  return `<span class="media-file-icon">${icon(item.kind === 'video' ? 'youtube' : 'messages')}<small>${item.kind === 'video' ? 'Video' : 'PDF'}</small></span>`;
}

/** Search box, filters, grid, pager. onItemClick(item, cardEl) decides what a click does. */
function createBrowser(root, { kind, onItemClick, selectable }) {
  const state = { q: '', kind: kind || '', folder: '', category: '', from: '', to: '', page: 1 };
  root.innerHTML = `
    <div class="filter-bar media-filters">
      <input type="search" class="input" data-f="q" placeholder="Search by filename" aria-label="Search by filename" />
      ${kind ? '' : `<select class="input" data-f="kind" aria-label="File type"><option value="">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="document">Documents</option></select>`}
      <select class="input" data-f="folder" aria-label="Folder"><option value="">All folders</option></select>
      <input type="text" class="input" data-f="category" placeholder="Category" aria-label="Category" />
      <label class="date-filter">From <input type="date" class="input" data-f="from" /></label>
      <label class="date-filter">To <input type="date" class="input" data-f="to" /></label>
    </div>
    <div class="media-grid" data-grid>${'<div class="media-card sk"></div>'.repeat(8)}</div>
    <div data-pager></div>`;
  const grid = root.querySelector('[data-grid]');
  let items = [];
  let timer;

  async function refresh() {
    const params = new URLSearchParams({ page: state.page, perPage: 40 });
    Object.entries(state).forEach(([k, v]) => { if (v && k !== 'page') params.set(k, v); });
    try {
      const data = await API.get(`/api/admin/media?${params}`);
      items = data.items;
      grid.innerHTML = items.length ? items.map((item) => `
        <button type="button" class="media-card${selectable && selectable.has(item.id) ? ' selected' : ''}" data-id="${Number(item.id)}" title="${escapeHtml(item.filename)}">
          <span class="media-thumb">${mediaThumb(item)}</span>
          <span class="media-name">${escapeHtml(item.filename)}</span>
        </button>`).join('') : `<div class="span-all">${emptyStateHTML(Object.values(state).some((v) => v && v !== 1) ? 'No files match these filters.' : 'No files yet. Upload your first one above.')}</div>`;
      const pager = root.querySelector('[data-pager]');
      pager.innerHTML = data.totalPages > 1 ? `<div class="pager">
        <button type="button" class="btn btn-ghost btn-sm" data-go="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${data.page} of ${data.totalPages}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-go="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>Next</button></div>` : '';
      pager.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { state.page = Number(b.dataset.go); refresh(); }));
    } catch (err) {
      grid.innerHTML = `<div class="span-all">${emptyStateHTML(err.message, 'warning')}</div>`;
    }
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.media-card[data-id]');
    if (card) onItemClick(items.find((m) => m.id === Number(card.dataset.id)), card);
  });
  root.querySelectorAll('[data-f]').forEach((input) => {
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state[input.dataset.f] = input.value.trim(); state.page = 1; refresh(); }, 250);
    });
  });

  async function refreshFolders() {
    await loadFolders();
    const select = root.querySelector('[data-f="folder"]');
    const current = select.value;
    select.innerHTML = `<option value="">All folders</option>${mediaFolders.map((f) => `<option value="${Number(f.id)}">${escapeHtml(f.name)}</option>`).join('')}`;
    select.value = current;
  }
  refreshFolders().catch(() => {});
  refresh();
  return { refresh, refreshFolders, state };
}

/** Drag-and-drop or browse. Files are previewed first, then uploaded one at a time. */
function createUploader(root, { onUploaded, accept = ACCEPT, getOptions = () => ({}) }) {
  root.innerHTML = `
    <label class="dropzone" tabindex="0">
      <input type="file" class="file-input" multiple accept="${accept}" />
      <span class="dropzone-title">${icon('plus')} Drop files here, or click to choose</span>
      <small>JPG, PNG, WEBP, GIF (10 MB) · SVG (2 MB) · MP4, WEBM (50 MB) · PDF (20 MB)</small>
    </label>
    <div class="upload-queue" hidden></div>
    <div class="upload-actions" hidden><button type="button" class="btn btn-primary btn-sm" data-start>Upload</button><button type="button" class="btn btn-ghost btn-sm" data-clear>Clear</button></div>`;
  const zone = root.querySelector('.dropzone');
  const input = root.querySelector('input[type=file]');
  const queueEl = root.querySelector('.upload-queue');
  const actions = root.querySelector('.upload-actions');
  let queue = [];

  function draw() {
    queueEl.hidden = !queue.length;
    actions.hidden = !queue.some((q) => q.state === 'ready');
    queueEl.innerHTML = queue.map((q, i) => `
      <div class="upload-row ${q.state}">
        ${q.preview ? `<img src="${q.preview}" alt="" />` : `<span class="upload-file">${escapeHtml((q.file.type.split('/')[1] || 'file').toUpperCase().slice(0, 4))}</span>`}
        <span class="upload-name">${escapeHtml(q.file.name)}<small>${formatBytes(q.file.size)}${q.message ? ` · ${escapeHtml(q.message)}` : ''}</small></span>
        ${q.state === 'ready' ? `<button type="button" class="btn btn-ghost btn-sm" data-remove="${i}" aria-label="Remove ${escapeHtml(q.file.name)}">${icon('close')}</button>` : ''}
      </div>`).join('');
  }

  function add(files) {
    [...files].forEach((file) => {
      const allowed = accept.split(',').includes(file.type);
      const limit = (MAX_SIZES[file.type] || 10) * 1048576;
      const problem = !allowed ? 'This file type isn’t allowed' : file.size > limit ? `Larger than the ${limit / 1048576} MB limit` : '';
      queue.push({
        file,
        preview: file.type.startsWith('image/') && file.type !== 'image/svg+xml' ? URL.createObjectURL(file) : null,
        state: problem ? 'error' : 'ready',
        message: problem
      });
    });
    draw();
  }

  async function start() {
    actions.hidden = true;
    const uploaded = [];
    for (const q of queue.filter((item) => item.state === 'ready')) {
      q.state = 'uploading';
      q.message = 'Uploading…';
      draw();
      const form = new FormData();
      form.append('file', q.file);
      Object.entries(getOptions()).forEach(([k, v]) => { if (v) form.append(k, v); });
      try {
        const { item } = await API.upload('/api/admin/media/upload', form);
        q.state = 'done';
        q.message = 'Uploaded';
        uploaded.push(item);
      } catch (err) {
        q.state = 'error';
        q.message = err.message;
      }
      draw();
    }
    if (uploaded.length) onUploaded(uploaded);
    queue.filter((q) => q.preview).forEach((q) => URL.revokeObjectURL(q.preview));
    queue = queue.filter((q) => q.state === 'error');
    setTimeout(draw, 1500);
  }

  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', (e) => add(e.dataTransfer.files));
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  queueEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (btn) { queue.splice(Number(btn.dataset.remove), 1); draw(); }
  });
  actions.querySelector('[data-start]').addEventListener('click', start);
  actions.querySelector('[data-clear]').addEventListener('click', () => { queue = []; draw(); });
}

// ---------- The picker ----------
const MediaPicker = {
  /** Resolves to an array of chosen items (empty if cancelled). */
  open({ kind, multiple = false } = {}) {
    return new Promise((resolve) => {
      const chosen = new Map();
      const selected = new Set();
      let done = false;
      const finish = (items) => {
        if (done) return;
        done = true;
        resolve(items);
      };
      const modal = openModal({
        title: 'Media Library',
        wide: true,
        onClose: () => finish([]),
        body: `<div data-uploader></div><div data-browser></div>
          <div class="modal-actions picker-actions"><button type="button" class="btn btn-primary" data-pick disabled>${multiple ? 'Add selected' : 'Use this file'}</button><span class="muted-cell" data-count></span></div>`
      });
      const pickBtn = modal.body.querySelector('[data-pick]');
      const update = () => {
        pickBtn.disabled = !chosen.size;
        modal.body.querySelector('[data-count]').textContent = chosen.size ? `${chosen.size} selected` : '';
      };
      const toggle = (item, card) => {
        if (!multiple) {
          chosen.clear();
          selected.clear();
          modal.body.querySelectorAll('.media-card.selected').forEach((c) => c.classList.remove('selected'));
        }
        if (selected.has(item.id)) {
          selected.delete(item.id);
          chosen.delete(item.id);
          if (card) card.classList.remove('selected');
        } else {
          selected.add(item.id);
          chosen.set(item.id, item);
          if (card) card.classList.add('selected');
        }
        update();
      };
      const browser = createBrowser(modal.body.querySelector('[data-browser]'), { kind, selectable: selected, onItemClick: toggle });
      createUploader(modal.body.querySelector('[data-uploader]'), {
        accept: kind === 'image' ? 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml' : ACCEPT,
        onUploaded: (items) => {
          items.forEach((item) => {
            if (multiple || items.length === 1) toggle(item);
          });
          browser.refresh();
        }
      });
      pickBtn.addEventListener('click', () => {
        finish([...chosen.values()]);
        modal.close();
      });
    });
  }
};

// ---------- The Media Library view ----------
let mediaBrowser;

function loadMediaView() {
  const section = document.getElementById('view-media');
  section.innerHTML = `
    <div class="panel-head">
      <h3>Files</h3>
      <div class="row-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="manageFoldersBtn">Folders</button>
        <button type="button" class="btn btn-ghost btn-sm" id="importMediaBtn" title="Adds the images your products already use, so they can be reused">Import product images</button>
      </div>
    </div>
    <div class="panel" id="mediaUploader"></div>
    <div class="panel" id="mediaBrowser"></div>`;
  mediaBrowser = createBrowser(document.getElementById('mediaBrowser'), { onItemClick: openMediaDetails });
  createUploader(document.getElementById('mediaUploader'), {
    getOptions: () => ({ folder_id: mediaBrowser.state.folder }),
    onUploaded: (items) => {
      toast(`${items.length} file${items.length === 1 ? '' : 's'} uploaded.`);
      mediaBrowser.refresh();
    }
  });
  document.getElementById('manageFoldersBtn').addEventListener('click', openFolders);
  document.getElementById('importMediaBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      toast((await API.post('/api/admin/media/import-existing', {})).message);
      mediaBrowser.refresh();
    } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
  });
}

async function openMediaDetails(item) {
  await loadFolders().catch(() => {});
  const modal = openModal({
    title: item.filename,
    wide: true,
    body: `<div class="media-detail">
      <div class="media-detail-preview">
        ${item.kind === 'image' ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt_text || '')}" />` : item.kind === 'video' ? `<video src="${escapeHtml(item.url)}" controls preload="metadata"></video>` : `<a class="btn btn-ghost" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open PDF</a>`}
        <dl class="media-facts">
          <dt>Format</dt><dd>${escapeHtml(item.mime_type)}</dd>
          <dt>Size</dt><dd>${formatBytes(item.size_bytes)}</dd>
          ${item.width ? `<dt>Dimensions</dt><dd>${Number(item.width)} × ${Number(item.height)} px</dd>` : ''}
          <dt>Uploaded</dt><dd>${formatDateTime(item.created_at)}</dd>
          ${item.uploaded_by ? `<dt>By</dt><dd>${escapeHtml(item.uploaded_by)}</dd>` : ''}
        </dl>
      </div>
      <form class="media-detail-form" novalidate>
        <div class="field"><label>Web address</label><div class="copy-row"><input type="text" value="${escapeHtml(item.url)}" readonly /><button type="button" class="btn btn-ghost btn-sm" data-copy>Copy</button></div></div>
        <div class="field"><label>File name</label><input name="filename" value="${escapeHtml(item.filename)}" maxlength="200" /><small class="help">Renaming doesn’t change the web address, so nothing using this file breaks.</small></div>
        <div class="field"><label>Alternative text</label><input name="alt_text" value="${escapeHtml(item.alt_text || '')}" maxlength="300" /></div>
        <div class="field"><label>Title</label><input name="title" value="${escapeHtml(item.title || '')}" maxlength="200" /></div>
        <div class="field"><label>Description</label><textarea name="description" rows="2" maxlength="2000">${escapeHtml(item.description || '')}</textarea></div>
        <div class="form-grid">
          <div class="field"><label>Category</label><input name="category" value="${escapeHtml(item.category || '')}" maxlength="60" /></div>
          <div class="field"><label>Folder</label><select name="folder_id"><option value="">No folder</option>${mediaFolders.map((f) => `<option value="${Number(f.id)}" ${f.id === item.folder_id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}</select></div>
        </div>
        <div class="media-usage" data-usage><span class="muted-cell">Checking where this file is used…</span></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-danger" data-delete>Delete</button></div>
        <div class="form-msg" style="display:none;"></div>
      </form>
    </div>`
  });
  const form = modal.body.querySelector('form');
  modal.body.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      toast('Web address copied.');
    } catch (e) {
      modal.body.querySelector('.copy-row input').select();
      toast('Press Ctrl+C to copy.', 'error');
    }
  });
  API.get(`/api/admin/media/${item.id}/usage`).then(({ usage }) => {
    modal.body.querySelector('[data-usage]').innerHTML = usage.length
      ? `<b>Used in ${usage.length} place${usage.length === 1 ? '' : 's'}:</b><ul>${usage.slice(0, 12).map((u) => `<li>${escapeHtml(u.type)}: ${escapeHtml(u.name)}</li>`).join('')}</ul>`
      : '<span class="muted-cell">Not used anywhere yet.</span>';
  }).catch(() => { modal.body.querySelector('[data-usage]').innerHTML = ''; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.folder_id = data.folder_id ? Number(data.folder_id) : null;
    try {
      await apiPatch(`/api/admin/media/${item.id}`, data);
      toast('Saved.');
      modal.close();
      mediaBrowser.refresh();
    } catch (err) {
      setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
    }
  });
  modal.body.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!confirm(`Delete "${item.filename}"?`)) return;
    try {
      await API.del(`/api/admin/media/${item.id}`);
    } catch (err) {
      if (!(err.data && err.data.inUse)) return toast(err.message, 'error');
      const places = err.data.usage.slice(0, 8).map((u) => `• ${u.type}: ${u.name}`).join('\n');
      if (!confirm(`${err.data.message}\n\n${places}\n\nDelete anyway?`)) return undefined;
      try {
        await API.del(`/api/admin/media/${item.id}?force=true`);
      } catch (e) { return toast(e.message, 'error'); }
    }
    toast('File deleted.');
    modal.close();
    mediaBrowser.refresh();
    return undefined;
  });
}

async function openFolders() {
  const modal = openModal({ title: 'Folders', body: '<div data-list></div><form class="copy-row" style="margin-top:14px;" novalidate><input name="name" placeholder="New folder name" maxlength="80" /><button class="btn btn-primary btn-sm" type="submit">Add</button></form>' });
  const draw = async () => {
    await loadFolders();
    modal.body.querySelector('[data-list]').innerHTML = mediaFolders.length ? mediaFolders.map((f) => `
      <div class="list-row"><span>${escapeHtml(f.name)}</span><span class="row-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-rename="${Number(f.id)}">Rename</button>
        <button type="button" class="btn btn-danger btn-sm" data-remove="${Number(f.id)}">Delete</button></span></div>`).join('') : '<p class="muted-cell">No folders yet.</p>';
    if (mediaBrowser) mediaBrowser.refreshFolders();
  };
  modal.body.addEventListener('click', async (e) => {
    const rename = e.target.closest('[data-rename]');
    const remove = e.target.closest('[data-remove]');
    try {
      if (rename) {
        const name = prompt('New name', mediaFolders.find((f) => f.id === Number(rename.dataset.rename)).name);
        if (name) await apiPatch(`/api/admin/media/folders/${rename.dataset.rename}`, { name });
      } else if (remove) {
        if (!confirm('Delete this folder? The files in it are kept.')) return;
        await API.del(`/api/admin/media/folders/${remove.dataset.remove}`);
      } else return;
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });
  modal.body.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.name;
    try {
      await API.post('/api/admin/media/folders', { name: input.value });
      input.value = '';
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });
  draw();
}
