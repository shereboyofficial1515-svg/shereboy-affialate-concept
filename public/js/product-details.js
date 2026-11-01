// public/js/product-details.js
document.addEventListener('DOMContentLoaded', () => {
  loadProduct();
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) loadProduct();
  });
});

async function loadProduct() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  const section = document.getElementById('productSection');

  if (!slug) {
    section.innerHTML = `<div class="container">${emptyStateHTML('No product was specified.', 'warning')}<p style="text-align:center;"><a class="btn btn-primary" href="/products.html">Browse products</a></p></div>`;
    return;
  }

  section.innerHTML = `<div class="container pd-grid" aria-busy="true"><div><span class="sk sk-media" style="border-radius:18px;"></span></div><div><span class="sk sk-line sk-w40"></span><br /><span class="sk sk-line sk-w80" style="height:26px;"></span><br /><span class="sk sk-line sk-w40" style="height:30px;"></span><span class="sk sk-btn"></span></div></div>`;

  try {
    const { product, related } = await API.get(`/api/products/slug/${encodeURIComponent(slug)}`);
    renderProduct(product);
    if (related && related.length) {
      document.getElementById('relatedSection').hidden = false;
      document.getElementById('relatedGrid').innerHTML = related.map(productCardHTML).join('');
    }
  } catch (err) {
    if (err.message === 'Product not found.') {
      section.innerHTML = `<div class="container">${emptyStateHTML("We couldn't find that product. It may have been removed.", 'search')}<p style="text-align:center;"><a class="btn btn-primary" href="/products.html">Browse products</a></p></div>`;
    } else {
      section.innerHTML = `<div class="container">${errorStateHTML(`We couldn't load this product. ${err.message}`)}</div>`;
    }
  }
}

function renderProduct(p) {
  const name = String(p.name).trim();
  document.title = `${name} — SHEREBOY AFFILIATE CONCEPT`;
  const images = p.images || [];
  const discounted = hasDiscount(p);
  const savings = discounted ? Math.round(p.price - p.final_price) : 0;
  const mainSizes = '(max-width: 860px) 100vw, 590px';

  const specRows = Object.entries(p.specifications || {})
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`).join('');

  document.getElementById('productSection').innerHTML = `
  <div class="container pd-grid">
    <div>
      <div class="pd-main-img"><img id="mainImg" ${productImageAttrs(images[0], mainSizes)} alt="${escapeHtml(name)}" width="800" height="800" decoding="async" /></div>
      ${images.length > 1 ? `<div class="pd-thumbs">${images.map((img, i) => `
        <button type="button" class="pd-thumb${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Show image ${i + 1} of ${images.length}">
          <img ${productImageAttrs(img, '72px')} alt="" width="72" height="72" loading="lazy" decoding="async" />
        </button>`).join('')}</div>` : ''}
    </div>
    <div>
      <nav class="pd-crumb" aria-label="Breadcrumb">
        <a href="/products.html">Products</a>
        ${p.category_name ? `<span aria-hidden="true">/</span><a href="/products.html?category=${encodeURIComponent(p.category_slug)}">${escapeHtml(p.category_name)}</a>` : ''}
      </nav>
      <h1 class="pd-title">${escapeHtml(name)}</h1>
      <div class="pd-badges">
        ${discounted ? `<span class="badge badge-discount">-${Math.round(p.discount_percent)}%</span>` : ''}
        ${p.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
        ${verifiedHTML(p)}
        ${ratingHTML(p)}
      </div>
      <div class="pd-price-block">
        <span class="pd-price-now">${formatNaira(p.final_price)}</span>
        ${discounted ? `<span class="price-was"><span class="visually-hidden">Was </span>${formatNaira(p.price)}</span>` : ''}
        ${savings > 0 ? `<span class="savings">You save ${formatNaira(savings)}</span>` : ''}
      </div>
      <div class="pcard-status">${stockHTML(p.availability)}</div>
      <div class="pd-actions">
        <a href="${escapeHtml(p.affiliate_link)}" target="_blank" rel="noopener sponsored nofollow" data-track-click="${Number(p.id)}" class="btn btn-primary">View Deal ${icon('external-link')}</a>
        <a href="/products.html" class="btn btn-outline">${icon('arrow-left')} All products</a>
      </div>
      <p class="pd-disclosure">Opens the retailer's site. We may earn a commission at no extra cost to you. Check the final price there before you buy.</p>
      <p class="pd-description">${escapeHtml(p.description || '')}</p>
      ${specRows ? `<div class="pd-specs"><h3 style="margin-bottom:12px;">Specifications</h3><table>${specRows}</table></div>` : ''}
    </div>
  </div>`;

  document.querySelectorAll('.pd-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const main = document.getElementById('mainImg');
      const next = document.createElement('template');
      next.innerHTML = `<img id="mainImg" ${productImageAttrs(images[Number(thumb.dataset.index)], mainSizes)} alt="${escapeHtml(name)}" width="800" height="800" decoding="async" />`;
      main.replaceWith(next.content.firstChild);
      document.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}
