// public/js/home.js
document.addEventListener('DOMContentLoaded', async () => {
  loadCategories();
  loadFeatured();
  loadDeals();
  loadTestimonials();
  loadFaqPreview();
});

async function loadCategories() {
  const grid = document.getElementById('homeCategoryGrid');
  try {
    const { categories } = await API.get('/api/categories');
    document.getElementById('statCategories').textContent = categories.length;
    grid.innerHTML = categories.slice(0, 6).map(categoryCardHTML).join('') ||
      '<div class="empty-state">No categories yet — check back soon.</div>';
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Couldn't load categories: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadFeatured() {
  const grid = document.getElementById('homeFeaturedGrid');
  try {
    const { items, total } = await API.get('/api/products?featured=true&perPage=4');
    document.getElementById('statProducts').textContent = total;
    grid.innerHTML = items.map(productCardHTML).join('') ||
      '<div class="empty-state">No featured products yet.</div>';
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Couldn't load products: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadDeals() {
  const grid = document.getElementById('homeDealsGrid');
  try {
    const { items } = await API.get('/api/products?deal=true&perPage=4');
    grid.innerHTML = items.map(productCardHTML).join('') ||
      '<div class="empty-state">No active deals right now — check back soon!</div>';
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Couldn't load deals: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadTestimonials() {
  const grid = document.getElementById('homeTestimonials');
  try {
    const { testimonials } = await API.get('/api/testimonials');
    grid.innerHTML = testimonials.map(testimonialCardHTML).join('') ||
      '<div class="empty-state">No testimonials yet.</div>';
  } catch (err) {
    grid.innerHTML = '';
  }
}

function loadFaqPreview() {
  const wrap = document.getElementById('homeFaqPreview');
  const preview = [
    { q: 'How do affiliate links work here?', a: 'When you click "Buy Now," you\'re taken to the retailer through our affiliate link. We may earn a small commission at no extra cost to you.' },
    { q: 'Are prices always up to date?', a: 'We refresh prices regularly, but the retailer\'s page is the final word on price and stock.' },
    { q: 'Can the AI assistant help me pick a product?', a: 'Yes — tap the chat bubble and ask about budget, features, or comparisons between items in our catalog.' }
  ];
  wrap.innerHTML = preview.map((f, i) => `
    <div class="faq-item${i === 0 ? ' open' : ''}">
      <div class="faq-q">${escapeHtml(f.q)} <span class="chev">⌄</span></div>
      <div class="faq-a"><p>${escapeHtml(f.a)}</p></div>
    </div>`).join('');
  wrap.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
  });
}
