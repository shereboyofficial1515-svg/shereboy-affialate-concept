// public/js/render.js
// Shared markup builders so product cards and category cards look and
// behave the same on every page that lists them.

function productCardHTML(p) {
  const img = (p.images && p.images[0]) || '/images/placeholder-product.svg';
  const savings = p.discount_percent > 0 ? Math.round(p.price - p.final_price) : 0;
  return `
  <div class="product-card">
    <a href="/product-details.html?slug=${encodeURIComponent(p.slug)}">
      <div class="product-thumb">
        <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" />
        <div class="badge-row">
          ${p.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
          ${p.is_deal ? '<span class="badge badge-deal">Deal</span>' : ''}
          ${p.availability === 'out_of_stock' ? '<span class="badge badge-out">Out of stock</span>' : ''}
        </div>
      </div>
      <div class="product-body">
        <span class="product-cat">${escapeHtml(p.category_name || 'Uncategorized')}</span>
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        <div class="product-price">
          <span class="price-now">${formatNaira(p.final_price)}</span>
          ${p.discount_percent > 0 ? `<span class="price-was">${formatNaira(p.price)}</span>` : ''}
        </div>
        ${savings > 0 ? `<span class="savings">You save ${formatNaira(savings)}</span>` : ''}
      </div>
    </a>
    <div class="product-actions">
      <a href="/product-details.html?slug=${encodeURIComponent(p.slug)}" class="btn btn-ghost btn-sm btn-block">Details</a>
      <a href="${p.affiliate_link}" target="_blank" rel="noopener sponsored" class="btn btn-primary btn-sm btn-block">Buy Now</a>
    </div>
  </div>`;
}

function categoryCardHTML(c) {
  return `
  <a href="/products.html?category=${encodeURIComponent(c.slug)}" class="cat-card">
    <div class="cat-icon">${c.icon || '🛍️'}</div>
    <h3>${escapeHtml(c.name)}</h3>
    <span>${c.product_count} product${c.product_count === 1 ? '' : 's'}</span>
  </a>`;
}

function testimonialCardHTML(t) {
  return `
  <div class="testi-card">
    <div class="testi-stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
    <p>"${escapeHtml(t.quote)}"</p>
    <div class="testi-name">${escapeHtml(t.customer_name)}</div>
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
