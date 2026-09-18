// public/js/api.js
// Tiny fetch wrapper shared by every page so we don't repeat
// error-handling and JSON parsing logic everywhere.

const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Please check your connection and try again.";

const API = {
  async request(url, options = {}) {
    let res;
    try {
      res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
    } catch (err) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.message || (data.errors && data.errors.join(' ')) || 'Something went wrong. Please try again.';
      throw new Error(message);
    }
    return data;
  },

  get(url) { return this.request(url); },
  post(url, body) { return this.request(url, { method: 'POST', body: JSON.stringify(body) }); },
  put(url, body) { return this.request(url, { method: 'PUT', body: JSON.stringify(body) }); },
  del(url) { return this.request(url, { method: 'DELETE' }); },

  // For multipart form data (product image uploads) — no JSON content-type.
  async upload(url, formData, method = 'POST') {
    let res;
    try {
      res = await fetch(url, { method, credentials: 'include', body: formData });
    } catch (err) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || (data.errors && data.errors.join(' ')) || 'Upload failed. Please try again.');
    return data;
  }
};

function formatNaira(value) {
  return '₦' + Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

// Escapes text for safe use as both HTML content AND inside quoted
// attributes (alt="...", title="..."). Shared by every page/script that
// injects dynamic text into markup.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared success/error notification renderer for form-msg boxes — keeps
// every form's feedback message visually consistent (icon + text) instead
// of each form building its own plain text string.
function setFormMessage(box, message, type) {
  const iconName = type === 'success' ? 'check' : 'warning';
  box.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  box.className = `form-msg ${type}`;
  box.style.display = 'flex';
}

// Shared empty-state markup (icon + message) for product/category grids
// and similar lists, so "nothing here" states look consistent everywhere.
function emptyStateHTML(message, iconName = 'inbox') {
  return `<div class="empty-state">${icon(iconName, 'empty-state-icon')}<p>${escapeHtml(message)}</p></div>`;
}
