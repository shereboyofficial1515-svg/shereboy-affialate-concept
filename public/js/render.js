// public/js/render.js
// Shared markup builders, so a product card looks and behaves the same on the
// homepage, listings, search results and related products.
// Requires api.js (escapeHtml, formatNaira) and icons.js (icon()) to be loaded first.

const PLACEHOLDER_IMAGE = '/images/placeholder-product.svg';
const PRODUCT_CARD_SIZES = '(max-width: 560px) 50vw, (max-width: 1000px) 33vw, 290px';

function productUrl(p) {
  return `/product-details.html?slug=${encodeURIComponent(p.slug)}`;
}

// Images saved by the upload pipeline have a smaller copy beside them ("-w480"),
// so phones don't download the full-size file.
function productImageAttrs(url, sizes = PRODUCT_CARD_SIZES) {
  if (!url) return `src="${PLACEHOLDER_IMAGE}" class="img-missing"`;
  const safe = escapeHtml(url);
  if (/\/opt-[^/]+\.webp$/.test(url)) {
    const small = escapeHtml(url.replace(/\.webp$/, '-w480.webp'));
    return `src="${small}" srcset="${small} 480w, ${safe} 1200w" sizes="${sizes}"`;
  }
  return `src="${safe}"`;
}

function hasDiscount(p) {
  return p.discount_percent > 0 && p.price > p.final_price;
}

function ratingHTML(p) {
  // Only real, entered rating data is ever displayed
  if (!(p.rating > 0 && p.rating_count > 0)) return '';
  return `<span class="rating" aria-label="Rated ${Number(p.rating).toFixed(1)} out of 5 from ${p.rating_count} ratings">${icon('star')}<b>${Number(p.rating).toFixed(1)}</b> (${Number(p.rating_count).toLocaleString('en-NG')})</span>`;
}

function stockHTML(availability) {
  if (availability === 'out_of_stock') return '<span class="stock stock-out">Out of stock</span>';
  if (availability === 'limited') return '<span class="stock stock-limited">Limited stock</span>';
  return '<span class="stock">In stock</span>';
}

function verifiedHTML(p) {
  return p.is_verified ? `<span class="badge badge-verified">${icon('check')} Verified deal</span>` : '';
}

function productCardHTML(p) {
  const url = productUrl(p);
  const discounted = hasDiscount(p);
  const out = p.availability === 'out_of_stock';
  return `
  <article class="pcard">
    <a class="pcard-media" href="${url}" tabindex="-1" aria-hidden="true">
      <img ${productImageAttrs(p.images && p.images[0])} alt="" width="480" height="480" loading="lazy" decoding="async" />
      <span class="pcard-badges">
        ${discounted ? `<span class="badge badge-discount">-${Math.round(p.discount_percent)}%</span>` : ''}
        ${p.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
      </span>
    </a>
    <div class="pcard-body">
      ${p.category_name ? `<a class="pcard-cat" href="/products.html?category=${encodeURIComponent(p.category_slug)}">${escapeHtml(p.category_name)}</a>` : ''}
      <h3 class="pcard-title"><a href="${url}">${escapeHtml(String(p.name).trim())}</a></h3>
      ${ratingHTML(p)}
      <div class="pcard-price">
        <span class="price-now">${formatNaira(p.final_price)}</span>
        ${discounted ? `<span class="price-was"><span class="visually-hidden">Was </span>${formatNaira(p.price)}</span>` : ''}
      </div>
      <div class="pcard-status">${stockHTML(p.availability)}${verifiedHTML(p)}</div>
      <a href="${escapeHtml(p.affiliate_link)}" target="_blank" rel="noopener sponsored nofollow" data-track-click="${Number(p.id)}"
        class="btn ${out ? 'btn-outline' : 'btn-primary'} btn-block pcard-cta" aria-label="View deal: ${escapeHtml(String(p.name).trim())} (opens the retailer's site)">View Deal ${icon('external-link')}</a>
    </div>
  </article>`;
}

function productSkeletonsHTML(count = 4) {
  const card = `
  <div class="pcard pcard-skeleton" aria-hidden="true">
    <span class="sk sk-media"></span>
    <div class="pcard-body">
      <span class="sk sk-line sk-w40"></span>
      <span class="sk sk-line sk-w80"></span>
      <span class="sk sk-line sk-w40"></span>
      <span class="sk sk-btn"></span>
    </div>
  </div>`;
  return card.repeat(count);
}

// Category `icon` values are short keywords (e.g. "electronics", "home") stored
// in the database and looked up against ICONS in icons.js.
function categoryCardHTML(c) {
  return `
  <a href="/products.html?category=${encodeURIComponent(c.slug)}" class="cat-card">
    <div class="cat-icon-wrap${c.image_url ? ' has-image' : ''}">${c.image_url ? `<img src="${escapeHtml(c.image_url)}" alt="" loading="lazy" decoding="async" />` : icon(c.icon || 'default')}</div>
    <div>
      <h3>${escapeHtml(c.name)}</h3>
      <span class="cat-count">${c.product_count} product${c.product_count === 1 ? '' : 's'}</span>
    </div>
  </a>`;
}

function testimonialCardHTML(t) {
  const rating = Math.min(Math.max(Number(t.rating) || 0, 0), 5);
  const filled = Array.from({ length: rating }, () => icon('star', 'star-filled')).join('');
  const empty = Array.from({ length: 5 - rating }, () => icon('star', 'star-empty')).join('');
  return `
  <div class="testi-card">
    <div class="testi-stars" role="img" aria-label="${rating} out of 5 stars">${filled}${empty}</div>
    <p>"${escapeHtml(t.quote)}"</p>
    <div class="testi-name">${escapeHtml(t.customer_name)}</div>
  </div>`;
}

// Shows an error with a working way to try again, instead of a dead end
function errorStateHTML(message) {
  return `<div class="empty-state">${icon('warning', 'empty-state-icon')}<p>${escapeHtml(message)}</p><button type="button" class="btn btn-outline btn-sm" data-retry>Try again</button></div>`;
}

// Counts clicks through to the retailer (powers "Trending"). sendBeacon survives
// the page changing and never delays the visitor.
document.addEventListener('click', (e) => {
  const link = e.target.closest && e.target.closest('[data-track-click]');
  if (link && navigator.sendBeacon) navigator.sendBeacon(`/api/products/${Number(link.dataset.trackClick)}/click`);
});
