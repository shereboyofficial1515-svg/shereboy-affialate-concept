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
