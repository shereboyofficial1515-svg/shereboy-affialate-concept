// public/js/product-details.js
document.addEventListener('DOMContentLoaded', async () => {
  const slug = new URLSearchParams(window.location.search).get('slug');
  const section = document.getElementById('productSection');

  if (!slug) {
    section.innerHTML = '<div class="container"><div class="empty-state">No product specified.</div></div>';
    return;
  }

  try {
    const { product, related } = await API.get(`/api/products/slug/${encodeURIComponent(slug)}`);
    renderProduct(product);
    if (related && related.length) {
      document.getElementById('relatedSection').hidden = false;
      document.getElementById('relatedGrid').innerHTML = related.map(productCardHTML).join('');
    }
  } catch (err) {
    section.innerHTML = `<div class="container"><div class="empty-state">Couldn't load this product: ${escapeHtml(err.message)}</div></div>`;
  }
});

function renderProduct(p) {
  document.title = `${p.name} — SHEREBOY AFFILIATE CONCEPT`;
  const images = p.images && p.images.length ? p.images : ['/images/placeholder-product.svg'];
  const savings = p.discount_percent > 0 ? Math.round(p.price - p.final_price) : 0;

  const specRows = Object.entries(p.specifications || {})
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`).join('');

  document.getElementById('productSection').innerHTML = `
  <div class="container pd-grid">
    <div>
      <div class="pd-main-img"><img id="mainImg" src="${images[0]}" alt="${escapeHtml(p.name)}" /></div>
      ${images.length > 1 ? `<div class="pd-thumbs">${images.map((img, i) => `<img src="${img}" class="${i === 0 ? 'active' : ''}" data-src="${img}" />`).join('')}</div>` : ''}
    </div>
    <div>
      <span class="product-cat">${escapeHtml(p.category_name || 'Uncategorized')}</span>
      <h1 style="margin-top:6px;">${escapeHtml(p.name)}</h1>
      <div class="badge-row" style="position:static;margin-top:12px;">
        ${p.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
        ${p.is_deal ? '<span class="badge badge-deal">Deal</span>' : ''}
        ${p.availability === 'out_of_stock' ? '<span class="badge badge-out">Out of stock</span>' : p.availability === 'limited' ? '<span class="badge" style="background:#FBE6E4;color:#C0362C;">Limited stock</span>' : ''}
      </div>
      <div class="pd-price-block">
        <span class="pd-price-now">${formatNaira(p.final_price)}</span>
        ${p.discount_percent > 0 ? `<span class="price-was">${formatNaira(p.price)}</span>` : ''}
        ${savings > 0 ? `<span class="savings">Save ${formatNaira(savings)}</span>` : ''}
      </div>
      <p style="color:var(--gray-500);">${escapeHtml(p.description || '')}</p>
      <div style="display:flex;gap:12px;margin-top:24px;">
        <a href="${p.affiliate_link}" target="_blank" rel="noopener sponsored" class="btn btn-primary">Buy Now →</a>
        <a href="/products.html" class="btn btn-ghost">← Back to products</a>
      </div>
      ${specRows ? `<div class="pd-specs"><h3 style="margin-bottom:12px;">Specifications</h3><table>${specRows}</table></div>` : ''}
    </div>
  </div>`;

  document.querySelectorAll('.pd-thumbs img').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.getElementById('mainImg').src = thumb.dataset.src;
      document.querySelectorAll('.pd-thumbs img').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}
