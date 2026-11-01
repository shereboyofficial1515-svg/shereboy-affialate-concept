// public/js/products.js
const state = {
  q: '',
  category: '',
  sort: 'newest',
  page: 1,
  featured: false,
  deal: false
};
let latestRequest = 0;

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
  state.page = Math.max(1, Number(params.get('page')) || 1);
  const sort = params.get('sort');
  if (sort) state.sort = sort;
}

// Filters live in the address bar, so results can be shared and Back works
function syncUrl() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.featured) params.set('featured', 'true');
  if (state.deal) params.set('deal', 'true');
  if (state.page > 1) params.set('page', state.page);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

async function loadCategoryOptions() {
  const select = document.getElementById('categoryFilter');
  try {
    const { categories } = await API.get('/api/categories');
    categories.filter(c => c.product_count > 0 || c.slug === state.category).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.slug;
      opt.textContent = c.name;
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
  sort.value = state.sort;
  if (!sort.value) { sort.value = 'newest'; state.sort = 'newest'; }
  if (state.featured) { chipFeatured.classList.add('active'); chipFeatured.setAttribute('aria-pressed', 'true'); }
  if (state.deal) { chipDeal.classList.add('active'); chipDeal.setAttribute('aria-pressed', 'true'); }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = search.value.trim(); state.page = 1; fetchProducts(); }, 350);
  });

  category.addEventListener('change', () => { state.category = category.value; state.page = 1; fetchProducts(); });
  sort.addEventListener('change', () => { state.sort = sort.value; state.page = 1; fetchProducts(); });

  chipFeatured.addEventListener('click', () => {
    state.featured = !state.featured;
    chipFeatured.classList.toggle('active', state.featured);
    chipFeatured.setAttribute('aria-pressed', String(state.featured));
    state.page = 1;
    fetchProducts();
  });
  chipDeal.addEventListener('click', () => {
    state.deal = !state.deal;
    chipDeal.classList.toggle('active', state.deal);
    chipDeal.setAttribute('aria-pressed', String(state.deal));
    state.page = 1;
    fetchProducts();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) fetchProducts();
  });
}

function emptyMessage() {
  if (state.q) return `Nothing matches "${state.q}". Try a different word or clear your filters.`;
  if (state.category || state.featured || state.deal) return 'Nothing matches these filters right now. Try clearing them.';
  return "We're adding new products. Please check back soon.";
}

async function fetchProducts() {
  const grid = document.getElementById('productGrid');
  const count = document.getElementById('resultCount');
  const request = ++latestRequest;
  grid.innerHTML = productSkeletonsHTML(8);
  count.textContent = '';
  syncUrl();

  const params = new URLSearchParams({
    q: state.q, category: state.category, sort: state.sort,
    page: state.page, featured: state.featured, deal: state.deal
  });

  try {
    const data = await API.get(`/api/products?${params.toString()}`);
    if (request !== latestRequest) return; // a newer search has replaced this one
    grid.innerHTML = data.items.length ? data.items.map(productCardHTML).join('') : emptyStateHTML(emptyMessage(), 'search');
    if (data.total) count.textContent = `${data.total} product${data.total === 1 ? '' : 's'}`;
    renderPagination(data.page, data.totalPages);
  } catch (err) {
    if (request !== latestRequest) return;
    grid.innerHTML = errorStateHTML(`We couldn't load the products. ${err.message}`);
    document.getElementById('pagination').innerHTML = '';
  }
}

function renderPagination(current, totalPages) {
  const wrap = document.getElementById('pagination');
  if (totalPages <= 1) { wrap.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn${i === current ? ' active' : ''}" data-page="${i}"${i === current ? ' aria-current="page"' : ''} aria-label="Page ${i}">${i}</button>`;
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
