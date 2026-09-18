// public/js/render.js
// Shared markup builders so product cards, category cards, and
// testimonials look and behave the same on every page that lists them.
// Requires api.js (escapeHtml) and icons.js (icon()) to be loaded first.

function productCardHTML(p) {
  const img = (p.images && p.images[0]) || '/images/placeholder-product.svg';
  const savings = p.discount_percent > 0 ? Math.round(p.price - p.final_price) : 0;
  return `
  <div class="product-card">
    <a href="/product-details.html?slug=${encodeURIComponent(p.slug)}">
      <div class="product-thumb">
        <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='/images/placeholder-product.svg';" />
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
      <a href="${p.affiliate_link}" target="_blank" rel="noopener sponsored" class="btn btn-primary btn-sm btn-block">Buy Now ${icon('external-link')}</a>
    </div>
  </div>`;
}

// Category `icon` values are now short keywords (e.g. "electronics",
// "home") stored in the database, looked up against ICONS in icons.js —
// not raw emoji characters like earlier versions of this site used.
function categoryCardHTML(c) {
  return `
  <a href="/products.html?category=${encodeURIComponent(c.slug)}" class="cat-card">
    <div class="cat-icon-wrap">${icon(c.icon || 'default')}</div>
    <h3>${escapeHtml(c.name)}</h3>
    <span>${c.product_count} product${c.product_count === 1 ? '' : 's'}</span>
  </a>`;
}

function testimonialCardHTML(t) {
  const filled = Array.from({ length: t.rating }, () => icon('star', 'star-filled')).join('');
  const empty = Array.from({ length: 5 - t.rating }, () => icon('star', 'star-empty')).join('');
  return `
  <div class="testi-card">
    <div class="testi-stars">${filled}${empty}</div>
    <p>"${escapeHtml(t.quote)}"</p>
    <div class="testi-name">${escapeHtml(t.customer_name)}</div>
  </div>`;
}

// escapeHtml is defined in api.js (loaded before this file everywhere)
// so it's available as a shared global without duplicating it here.