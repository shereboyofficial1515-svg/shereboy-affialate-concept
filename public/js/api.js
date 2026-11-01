// public/js/api.js
// Tiny fetch wrapper shared by every page so we don't repeat
// error-handling and JSON parsing logic everywhere.

const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Please check your connection and try again.";
const REQUEST_TIMEOUT_MS = 45000;

const API = {
  async request(url, options = {}) {
    const safeToRepeat = !options.method || options.method === 'GET';
    let res;
    // A sleeping host answers 502/503 for a moment while it wakes up, so a read gets a second try
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(url, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          signal: AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
          ...options
        });
        if (!(safeToRepeat && attempt === 1 && (res.status === 502 || res.status === 503))) break;
      } catch (err) {
        if (!safeToRepeat || attempt > 1) throw new Error(NETWORK_ERROR_MESSAGE);
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.message || (data.errors && data.errors.join(' ')) || 'Something went wrong. Please try again.';
      const error = new Error(message);
      error.status = res.status;
      error.data = data;
      throw error;
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

// A product image that fails to load falls back to the neutral placeholder. A
// resized copy is tried first when there is one. Image errors don't bubble, so
// this listens in the capture phase; inline handlers are blocked by the CSP.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG') return;
  if (img.hasAttribute('srcset') && !img.dataset.triedFull) {
    img.dataset.triedFull = '1';
    img.removeAttribute('srcset');
    img.src = img.src.replace(/-w480\.webp(\?.*)?$/, '.webp');
    return;
  }
  if (!img.dataset.fellBack) {
    img.dataset.fellBack = '1';
    img.classList.add('img-missing');
    img.src = '/images/placeholder-product.svg';
  }
}, true);

document.addEventListener('load', (e) => {
  if (e.target && e.target.tagName === 'IMG') e.target.classList.add('is-loaded');
}, true);

// Named for its history: shows prices in whichever currency General Settings names
function formatNaira(value) {
  const regional = (window.SITE && window.SITE.regional) || { locale: 'en-NG', currency: 'NGN' };
  try {
    if (regional.currency === 'NGN') return '₦' + Number(value).toLocaleString(regional.locale, { maximumFractionDigits: 0 });
    return Number(value).toLocaleString(regional.locale, { style: 'currency', currency: regional.currency, maximumFractionDigits: 0 });
  } catch (e) {
    return `${regional.currency} ${Number(value).toLocaleString()}`;
  }
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
