// public/js/home.js
// Fills the homepage from one request (/api/home). Sections with nothing to show
// are hidden rather than left empty, and a failure offers a retry.

const HOME_SECTIONS = ['featured', 'deals', 'trending', 'recent', 'recommended'];

document.addEventListener('DOMContentLoaded', () => {
  bindHeroSearch();
  renderFaqPreview();
  loadHome();
});

function bindHeroSearch() {
  const form = document.getElementById('heroSearch');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    window.location.href = q ? `/products.html?q=${encodeURIComponent(q)}` : '/products.html';
  });
}

function showSkeletons() {
  HOME_SECTIONS.forEach((key) => {
    const section = document.getElementById(`section-${key}`);
    // Sections that may turn out empty stay hidden until there's data for them
    if (key === 'featured' || key === 'deals') {
      section.hidden = false;
      document.getElementById(`grid-${key}`).innerHTML = productSkeletonsHTML();
    }
  });
}

async function loadHome() {
  showSkeletons();
  document.getElementById('homeError').hidden = true;
  try {
    render(await API.get('/api/home'));
  } catch (err) {
    HOME_SECTIONS.forEach((key) => { document.getElementById(`section-${key}`).hidden = true; });
    document.getElementById('section-categories').hidden = true;
    document.getElementById('section-empty').hidden = true;
    document.getElementById('homeHeroVisual').hidden = true;
    const box = document.getElementById('homeError');
    box.hidden = false;
    box.querySelector('.container').innerHTML = errorStateHTML(`We couldn't load the products. ${err.message}`);
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-retry]')) loadHome();
});

function render(data) {
  let shown = 0;
  HOME_SECTIONS.forEach((key) => {
    const items = data[key] || [];
    document.getElementById(`section-${key}`).hidden = !items.length;
    document.getElementById(`grid-${key}`).innerHTML = items.map(productCardHTML).join('');
    shown += items.length;
  });
  document.getElementById('section-empty').hidden = shown > 0;

  renderCategories(data.categories || []);
  renderSpotlight(data.spotlight || []);
  renderStats(data.stats || {});

  const testimonials = data.testimonials || [];
  document.getElementById('section-testimonials').hidden = !testimonials.length;
  document.getElementById('homeTestimonials').innerHTML = testimonials.map(testimonialCardHTML).join('');
}

function renderCategories(categories) {
  document.getElementById('section-categories').hidden = !categories.length;
  document.getElementById('homeCategoryGrid').innerHTML = categories.map(categoryCardHTML).join('');
  document.getElementById('heroChips').innerHTML = categories.slice(0, 4)
    .map((c) => `<a href="/products.html?category=${encodeURIComponent(c.slug)}">${escapeHtml(c.name)}</a>`).join('');
}

// Real products only: the hero shows nothing rather than an invented example
function renderSpotlight(items) {
  const wrap = document.getElementById('homeHeroVisual');
  wrap.hidden = !items.length;
  wrap.innerHTML = items.map((p) => `
    <a class="spotlight-item" href="${productUrl(p)}">
      <span class="spotlight-media"><img ${productImageAttrs(p.images[0], '(max-width: 900px) 90vw, 300px')} alt="${escapeHtml(String(p.name).trim())}" width="480" height="480" decoding="async" /></span>
      <span class="spotlight-meta">
        <span class="spotlight-name">${escapeHtml(String(p.name).trim())}</span>
        <span class="spotlight-price">${formatNaira(p.final_price)}</span>
      </span>
    </a>`).join('');
}

function renderStats(stats) {
  const wrap = document.getElementById('heroStats');
  const entries = [
    [stats.products, stats.products === 1 ? 'Product listed' : 'Products listed'],
    [stats.categories, stats.categories === 1 ? 'Category' : 'Categories']
  ].filter(([value]) => value > 0);
  wrap.hidden = !entries.length;
  wrap.innerHTML = entries.map(([value, label]) => `<div class="hero-stat"><b>${Number(value)}</b><span>${label}</span></div>`).join('');
}

function renderFaqPreview() {
  const wrap = document.getElementById('homeFaqPreview');
  const preview = [
    { q: 'How do affiliate links work here?', a: 'When you click "View Deal," you\'re taken to the retailer through our affiliate link. We may earn a small commission at no extra cost to you.' },
    { q: 'Are prices always up to date?', a: 'We refresh prices regularly, but the retailer\'s page is the final word on price and stock.' },
    { q: 'Can the AI assistant help me pick a product?', a: 'Yes. Tap the chat bubble and ask about budget, features, or comparisons between items in our catalog.' }
  ];
  wrap.innerHTML = preview.map((f, i) => `
    <div class="faq-item${i === 0 ? ' open' : ''}">
      <div class="faq-q" role="button" tabindex="0" aria-expanded="${i === 0 ? 'true' : 'false'}">${escapeHtml(f.q)} ${icon('chevron', 'chev')}</div>
      <div class="faq-a"><p>${escapeHtml(f.a)}</p></div>
    </div>`).join('');
  wrap.querySelectorAll('.faq-q').forEach((q) => {
    const toggle = () => {
      const isOpen = q.parentElement.classList.toggle('open');
      q.setAttribute('aria-expanded', String(isOpen));
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}
