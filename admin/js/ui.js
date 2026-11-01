// admin/js/ui.js
// Small helpers shared by every dashboard view: toasts, form building and modals.
// Loaded first. All dynamic text goes through escapeHtml (public/js/api.js).

const Permissions = { list: [], can: (p) => Permissions.list.includes(p) };

function toast(message, type = 'success') {
  let wrap = document.getElementById('toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toasts';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.append(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  wrap.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 3500);
}

const apiPatch = (url, body) => API.request(url, { method: 'PATCH', body: JSON.stringify(body) });

const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function emptyRow(columns, message, iconName) {
  return `<tr><td colspan="${columns}">${emptyStateHTML(message, iconName)}</td></tr>`;
}

// ---------- Forms described as data ----------
// { name, label, type, help, options: [[value, label]], min, max, step, rows, span }
function fieldHTML(field, value) {
  const id = `f-${field.name}-${Math.random().toString(36).slice(2, 7)}`;
  const v = value ?? '';
  const help = field.help ? `<small class="help">${escapeHtml(field.help)}</small>` : '';
  const span = field.span === 1 ? '' : ' span-2';
  switch (field.type) {
    case 'textarea':
      return `<div class="field${span}"><label for="${id}">${escapeHtml(field.label)}</label><textarea id="${id}" name="${field.name}" rows="${field.rows || 3}" ${field.max ? `maxlength="${field.max}"` : ''}>${escapeHtml(v)}</textarea>${help}</div>`;
    case 'checkbox':
      return `<div class="field${span}"><label class="switch-row" for="${id}"><input type="checkbox" id="${id}" name="${field.name}" ${v ? 'checked' : ''} /> <span>${escapeHtml(field.label)}</span></label>${help}</div>`;
    case 'select':
      return `<div class="field${span}"><label for="${id}">${escapeHtml(field.label)}</label><select id="${id}" name="${field.name}">${field.options.map(([val, text]) => `<option value="${escapeHtml(val)}" ${String(val) === String(v) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>${help}</div>`;
    case 'color':
      return `<div class="field${span}"><label for="${id}">${escapeHtml(field.label)}</label><div class="color-row"><input type="color" id="${id}" name="${field.name}" value="${escapeHtml(v)}" /><code>${escapeHtml(v)}</code></div>${help}</div>`;
    case 'media':
      return `<div class="field${span}"><label>${escapeHtml(field.label)}</label><div class="media-field" data-media-field><img src="${escapeHtml(v)}" alt="" ${v ? '' : 'hidden'} /><input type="hidden" name="${field.name}" value="${escapeHtml(v)}" /><div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-media-choose>Choose from Media Library</button><button type="button" class="btn btn-ghost btn-sm" data-media-clear ${v ? '' : 'hidden'}>Remove</button></div></div>${help}</div>`;
    default:
      return `<div class="field${span}"><label for="${id}">${escapeHtml(field.label)}</label><input type="${field.type || 'text'}" id="${id}" name="${field.name}" value="${escapeHtml(v)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? (field.type === 'number' ? `max="${field.max}"` : `maxlength="${field.max}"`) : ''} ${field.step ? `step="${field.step}"` : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''} />${help}</div>`;
  }
}

function formHTML(fields, values) {
  return fields.map((f) => (f.heading ? `<h3 class="form-heading span-2">${escapeHtml(f.heading)}</h3>` : fieldHTML(f, values[f.name]))).join('');
}

function readForm(root, fields) {
  const out = {};
  fields.forEach((f) => {
    if (f.heading) return;
    const input = root.querySelector(`[name="${f.name}"]`);
    if (!input) return;
    if (f.type === 'checkbox') out[f.name] = input.checked;
    else if (f.type === 'number') out[f.name] = input.value === '' ? 0 : Number(input.value);
    else out[f.name] = input.value;
  });
  return out;
}

// Media fields and colour labels work anywhere they appear
document.addEventListener('click', async (e) => {
  const choose = e.target.closest('[data-media-choose]');
  const clear = e.target.closest('[data-media-clear]');
  if (!choose && !clear) return;
  const wrap = e.target.closest('[data-media-field]');
  const img = wrap.querySelector('img');
  const input = wrap.querySelector('input');
  const removeBtn = wrap.querySelector('[data-media-clear]');
  if (clear) {
    input.value = '';
    img.hidden = true;
    removeBtn.hidden = true;
  } else {
    const [item] = await MediaPicker.open({ kind: 'image' });
    if (!item) return;
    input.value = item.url;
    img.src = item.thumb_url || item.url;
    img.hidden = false;
    removeBtn.hidden = false;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
document.addEventListener('input', (e) => {
  if (e.target.type === 'color') {
    const label = e.target.parentElement.querySelector('code');
    if (label) label.textContent = e.target.value.toUpperCase();
  }
});

// ---------- Modals ----------
function openModal({ title, body, wide, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `<div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <div class="modal-head"><h3>${escapeHtml(title)}</h3><button type="button" class="modal-close" aria-label="Close">${icon('close')}</button></div>
    <div class="modal-body">${body}</div>
  </div>`;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal-close').addEventListener('click', close);
  document.body.append(overlay);
  return { root: overlay, body: overlay.querySelector('.modal-body'), close };
}

/** A form in a modal. onSave(values) may throw; the message is shown in the form. */
function openFormModal({ title, fields, values = {}, saveLabel = 'Save', onSave }) {
  const modal = openModal({
    title,
    body: `<form novalidate><div class="form-grid">${formHTML(fields, values)}</div>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">${escapeHtml(saveLabel)}</button><button type="button" class="btn btn-ghost" data-cancel>Cancel</button></div>
      <div class="form-msg" style="display:none;"></div></form>`
  });
  const form = modal.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', modal.close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await onSave(readForm(form, fields));
      modal.close();
    } catch (err) {
      setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  return modal;
}

/** A settings tab: fields rendered into a section, saved with one button. */
function renderSettingsForm(sectionId, { fields, values, intro, onSave, extra = '' }) {
  const section = document.getElementById(sectionId);
  section.innerHTML = `${extra}<form class="panel" novalidate>
    ${intro ? `<p class="muted-cell" style="margin-bottom:16px;">${escapeHtml(intro)}</p>` : ''}
    <div class="form-grid">${formHTML(fields, values)}</div>
    <div class="modal-actions"><button type="submit" class="btn btn-primary">Save</button></div>
    <div class="form-msg" style="display:none;"></div>
  </form>`;
  const form = section.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await onSave(readForm(form, fields));
      form.querySelector('.form-msg').style.display = 'none';
      toast('Saved and applied to the website.');
    } catch (err) {
      setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  return form;
}
