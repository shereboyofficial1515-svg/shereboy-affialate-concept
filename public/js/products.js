// public/js/products.js
const state = {
  q: '',
  category: '',
  sort: 'newest',
  page: 1,
  featured: false,
  deal: false
};

document.addEventListener('DOMContentLoaded', () => {
  hydrateFromUrl();
  loadCategoryOptions();
  bindControls();
  fetchProducts();
});

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.category = params.get('category') || '';
  state.featured = params.get('featured') === 'true';
  state.deal = params.get('deal') === 'true';
  state.q = params.get('q') || '';
}

async function loadCategoryOptions() {
  const select = document.getElementById('categoryFilter');
  try {
    const { categories } = await API.get('/api/categories');
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.slug;
      opt.textContent = `${c.icon || ''} ${c.name}`.trim();
      if (c.slug === state.category) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) { /* categories are non-critical here */ }
}

function bindControls() {
  const search = document.getElementById('searchInput');
  const category = document.getElementById('categoryFilter');
  const sort = document.getElementById('sortFilter');
  const chipFeatured = document.getElementById('chipFeatured');
  const chipDeal = document.getElementById('chipDeal');

  search.value = state.q;
  if (state.featured) chipFeatured.classList.add('active');
  if (state.deal) chipDeal.classList.add('active');

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = search.value; state.page = 1; fetchProducts(); }, 350);
  });

  category.addEventListener('change', () => { state.category = category.value; state.page = 1; fetchProducts(); });
  sort.addEventListener('change', () => { state.sort = sort.value; state.page = 1; fetchProducts(); });

  chipFeatured.addEventListener('click', () => {
    state.featured = !state.featured;
    chipFeatured.classList.toggle('active', state.featured);
    state.page = 1;
    fetchProducts();
  });
  chipDeal.addEventListener('click', () => {
    state.deal = !state.deal;
    chipDeal.classList.toggle('active', state.deal);
    state.page = 1;
    fetchProducts();
  });
}

async function fetchProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '<div class="empty-state">Loading products…</div>';

  const params = new URLSearchParams({
    q: state.q, category: state.category, sort: state.sort,
    page: state.page, featured: state.featured, deal: state.deal
  });

  try {
    const data = await API.get(`/api/products?${params.toString()}`);
    if (!data.items.length) {
      grid.innerHTML = '<div class="empty-state">No products match your filters. Try clearing search or category.</div>';
    } else {
      grid.innerHTML = data.items.map(productCardHTML).join('');
    }
    renderPagination(data.page, data.totalPages);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Couldn't load products: ${escapeHtml(err.message)}</div>`;
  }
}

function renderPagination(current, totalPages) {
  const wrap = document.getElementById('pagination');
  if (totalPages <= 1) { wrap.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn${i === current ? ' active' : ''}" data-page="${i}">${i}</button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.page = Number(btn.dataset.page);
      fetchProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}
