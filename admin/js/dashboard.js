// admin/js/dashboard.js
let allCategories = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const span = el.querySelector('.icon');
    if (span) span.innerHTML = ICONS[el.dataset.icon] || '';
  });
  await guardSession();
  applyPermissions();
  bindNav();
  bindLogout();
  bindProductList();
  bindCategoryModal();
  if (Permissions.can('products.publish')) loadCategories();
  route();
});

// Table and form buttons (inline onclick handlers are blocked by the CSP)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const actions = {
    'edit-category': () => window.editCategory(id),
    'delete-category': () => window.deleteCategory(id)
  };
  actions[btn.dataset.action]?.();
});

// ---------- Session guard ----------
async function guardSession() {
  try {
    const data = await API.get('/api/auth/me');
    document.getElementById('adminName').textContent = `${data.user.name} (${data.user.role})`;
    Permissions.list = data.user.permissions;
  } catch (err) {
    window.location.href = '/admin/login.html';
  }
}

function bindLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await API.post('/api/auth/logout', {}); } catch (e) { /* ignore */ }
    window.location.href = '/admin/login.html';
  });
}

// ---------- Navigation: every view has its own address, so Back and refresh work ----------
const VIEW_LOADERS = {
  overview: () => loadOverview(),
  analytics: () => loadAnalyticsView(),
  products: () => loadProducts(),
  categories: () => loadCategories(),
  media: () => loadMediaView(),
  homepage: () => loadHomepageView(),
  banners: () => loadBannersView(),
  testimonials: () => loadTestimonials(),
  pages: () => loadPagesView(),
  ai: () => loadAiCentreView(),
  teach: () => loadTeachView(),
  knowledge: () => loadKnowledgeView(),
  'ai-activity': () => loadAiActivityView(),
  subscribers: () => loadSubscribers(),
  campaigns: () => loadCampaigns(),
  logs: () => loadLogs(),
  messages: () => loadMessages(),
  settings: () => loadIdentityView(),
  appearance: () => loadAppearanceView(),
  seo: () => loadSeoView(),
  'email-settings': () => loadEmailSettingsView(),
  regional: () => loadRegionalView(),
  users: () => loadUsersView(),
  audit: () => loadAuditView(),
  health: () => loadHealthView()
};

function showView(view, title) {
  document.querySelectorAll('main section[id^="view-"]').forEach(s => { s.hidden = true; });
  const section = document.getElementById(`view-${view}`);
  section.hidden = false;
  document.getElementById('viewTitle').textContent = title;
  window.scrollTo(0, 0);
}

function route() {
  const hash = location.hash.slice(1) || 'overview';
  const productMatch = hash.match(/^product-(\d+)$/);
  document.querySelectorAll('.side-nav button').forEach(b => {
    const active = b.dataset.view === hash || (productMatch && b.dataset.view === 'products');
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  closeMenu();
  if (productMatch) return openProductEditor(Number(productMatch[1]));
  if (hash === 'new-product') return openProductEditor(null);
  const button = document.querySelector(`.side-nav button[data-view="${hash}"]`);
  if (!button || !VIEW_LOADERS[hash] || button.hidden) {
    location.hash = '#overview';
    return undefined;
  }
  showView(hash, button.dataset.label);
  return VIEW_LOADERS[hash]();
}

function closeMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
}

function bindNav() {
  document.querySelectorAll('.side-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (location.hash === `#${btn.dataset.view}`) route();
      else location.hash = `#${btn.dataset.view}`;
    });
  });
  document.getElementById('menuToggle').addEventListener('click', () => {
    const open = document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('menuToggle').setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', route);
}

// Only what this person's role can use appears in the menu
function applyPermissions() {
  document.querySelectorAll('[data-perm]').forEach(el => { el.hidden = !Permissions.can(el.dataset.perm); });
  document.querySelectorAll('.nav-group').forEach(group => {
    group.hidden = ![...group.querySelectorAll('button')].some(b => !b.hidden);
  });
}

function bindProductList() {
  document.getElementById('addProductBtn').addEventListener('click', () => { location.hash = '#new-product'; });
  document.getElementById('productStatusTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-status]');
    if (!tab) return;
    productFilter.status = tab.dataset.status;
    productFilter.page = 1;
    loadProducts();
  });
  let timer;
  document.getElementById('productSearch').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { productFilter.q = e.target.value.trim(); productFilter.page = 1; loadProducts(); }, 300);
  });
  document.getElementById('productsTableBody').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-product]');
    if (edit) location.hash = `#product-${edit.dataset.editProduct}`;
  });
}

// ---------- Overview ----------
async function loadOverview() {
  try {
    const { stats } = await API.get('/api/products/stats');
    const grid = document.getElementById('statGrid');
    grid.innerHTML = `
      <div class="stat-card"><b>${stats.totalProducts}</b><span>Total products</span></div>
      <div class="stat-card"><b>${stats.totalCategories}</b><span>Categories</span></div>
      <div class="stat-card"><b>${stats.featured}</b><span>Featured</span></div>
      <div class="stat-card"><b>${stats.deals}</b><span>On deal</span></div>
      <div class="stat-card"><b>${stats.outOfStock}</b><span>Out of stock</span></div>`;
  } catch (err) { /* non-critical */ }
  try {
    const { items } = await API.get('/api/products?perPage=100');
    const missing = items.filter(p => p.images_missing).length;
    const box = document.getElementById('missingImagesAlert');
    box.hidden = !missing;
    box.innerHTML = missing ? `${icon('warning')}<span><b>${missing} product${missing === 1 ? ' has' : 's have'} no working image.</b> Visitors see a placeholder. Open Products, then edit ${missing === 1 ? 'it' : 'each one'} to upload the photo.</span>` : '';
  } catch (err) { /* non-critical */ }
}

// ---------- Categories: load + table + dropdown ----------
async function loadCategories() {
  try {
    const { categories } = await API.get('/api/categories');
    allCategories = categories;
    renderCategoryTable(categories);
  } catch (err) {
    document.getElementById('categoriesTableBody').innerHTML = `<tr><td colspan="5">${emptyStateHTML(err.message, 'warning')}</td></tr>`;
  }
}

function renderCategoryTable(categories) {
  const body = document.getElementById('categoriesTableBody');
  if (!categories.length) { body.innerHTML = `<tr><td colspan="5">${emptyStateHTML('No categories yet.')}</td></tr>`; return; }
  body.innerHTML = categories.map(c => `
    <tr>
      <td style="font-size:1.2rem;">${c.image_url ? `<img class="table-thumb" src="${escapeHtml(c.image_url)}" alt="" />` : icon(c.icon || 'default')}</td>
      <td>${escapeHtml(c.name)}</td>
      <td class="num">${c.product_count}</td>
      <td style="max-width:260px;">${escapeHtml(c.description || '—')}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit-category" data-id="${Number(c.id)}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-category" data-id="${Number(c.id)}">Delete</button>
      </td>
    </tr>`).join('');
}

// ---------- Category modal ----------
function bindCategoryModal() {
  const overlay = document.getElementById('categoryModalOverlay');
  const openModal = () => overlay.classList.add('open');
  const closeModal = () => { overlay.classList.remove('open'); resetCategoryForm(); };

  document.getElementById('addCategoryBtn').addEventListener('click', () => { resetCategoryForm(); openModal(); });
  document.getElementById('categoryModalClose').addEventListener('click', closeModal);
  document.getElementById('cancelCategoryBtn').addEventListener('click', closeModal);

  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;

    const id = document.getElementById('categoryId').value;
    const payload = {
      name: document.getElementById('cName').value,
      icon: document.getElementById('cIcon').value,
      description: document.getElementById('cDescription').value,
      image_url: document.getElementById('cImage').value || null
    };
    const msgBox = document.getElementById('categoryFormMsg');
    const submitLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      if (id) await API.put(`/api/categories/${id}`, payload);
      else await API.post('/api/categories', payload);
      closeModal();
      loadCategories();
    } catch (err) {
      setFormMessage(msgBox, err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
}

function resetCategoryForm() {
  document.getElementById('categoryForm').reset();
  document.getElementById('categoryId').value = '';
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('categoryFormMsg').style.display = 'none';
  setCategoryImage('');
}

function setCategoryImage(url) {
  const wrap = document.getElementById('cImage').closest('[data-media-field]');
  document.getElementById('cImage').value = url || '';
  wrap.querySelector('img').src = url || '';
  wrap.querySelector('img').hidden = !url;
  wrap.querySelector('[data-media-clear]').hidden = !url;
}

window.editCategory = function (id) {
  const c = allCategories.find(c => c.id === id);
  if (!c) return;
  document.getElementById('categoryId').value = c.id;
  document.getElementById('cName').value = c.name;
  document.getElementById('cIcon').value = c.icon || '';
  document.getElementById('cDescription').value = c.description || '';
  setCategoryImage(c.image_url);
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('categoryModalOverlay').classList.add('open');
};

window.deleteCategory = async function (id) {
  if (!confirm('Delete this category? Products in it will become Uncategorized.')) return;
  try {
    await API.del(`/api/categories/${id}`);
    loadCategories();
  } catch (err) { alert(err.message); }
};

// ---------- Messages ----------
async function loadMessages() {
  try {
    const { messages } = await API.get('/api/contact/messages');
    const body = document.getElementById('messagesTableBody');
    body.innerHTML = messages.length ? messages.map(m => `
      <tr>
        <td>${escapeHtml(m.name)}<br><span style="color:var(--gray-500);font-size:0.78rem;">${escapeHtml(m.email)}</span></td>
        <td>${escapeHtml(m.subject || '—')}</td>
        <td style="max-width:320px;">${escapeHtml(m.message)}</td>
        <td style="white-space:nowrap;color:var(--gray-500);font-size:0.8rem;">${new Date(m.created_at).toLocaleString()}</td>
      </tr>`).join('') : `<tr><td colspan="4">${emptyStateHTML('No messages yet.')}</td></tr>`;
  } catch (err) {
    document.getElementById('messagesTableBody').innerHTML = `<tr><td colspan="4">${emptyStateHTML(err.message, 'warning')}</td></tr>`;
  }
}

// escapeHtml is defined in api.js (loaded before this file) as a shared global.
