// public/js/api.js
// Tiny fetch wrapper shared by every page so we don't repeat
// error-handling and JSON parsing logic everywhere.

const API = {
  async request(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.message || (data.errors && data.errors.join(' ')) || 'Something went wrong.';
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
    const res = await fetch(url, { method, credentials: 'include', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || (data.errors && data.errors.join(' ')) || 'Upload failed.');
    return data;
  }
};

function formatNaira(value) {
  return '₦' + Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}
