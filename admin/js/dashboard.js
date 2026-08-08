// admin/js/dashboard.js
let allCategories = [];
let existingImagesForEdit = [];

document.addEventListener('DOMContentLoaded', async () => {
  await guardSession();
  bindNav();
  bindLogout();
  bindProductModal();
  bindCategoryModal();
  loadOverview();
  loadCategories();
});

// ---------- Session guard ----------
async function guardSession() {
  try {
    const data = await API.get('/api/auth/me');
    document.getElementById('adminName').textContent = data.user.name;
  } catch (err) {
    window.location.href = '/admin/login.html';
  }
}

function bindLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await API.post('/api/auth/logout', {}); } catch (e) { /* ignore */ }
    sessionStorage.removeItem('shereboy_admin_token');
    window.location.href = '/admin/login.html';
  });
}

// ---------- Sidebar navigation ----------
function bindNav() {
  document.querySelectorAll('.side-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.querySelectorAll('main section[id^="view-"]').forEach(s => s.hidden = true);
      document.getElementById(`view-${view}`).hidden = false;
      document.getElementById('viewTitle').textContent = btn.textContent.replace(/^\S+\s/, '');

      if (view === 'products') loadProducts();
      if (view === 'categories') loadCategories();
      if (view === 'messages') loadMessages();
      if (view === 'subscribers') loadSubscribers();
      if (view === 'overview') loadOverview();
    });
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
}

// ---------- Categories: load + table + dropdown ----------
async function loadCategories() {
  try {
    const { categories } = await API.get('/api/categories');
    allCategories = categories;
    renderCategoryTable(categories);
    renderCategoryDropdown(categories);
  } catch (err) {
    document.getElementById('categoriesTableBody').innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderCategoryTable(categories) {
  const body = document.getElementById('categoriesTableBody');
  if (!categories.length) { body.innerHTML = '<tr><td colspan="5" class="empty-state">No categories yet.</td></tr>'; return; }
  body.innerHTML = categories.map(c => `
    <tr>
      <td style="font-size:1.2rem;">${c.icon || '🛍️'}</td>
      <td>${escapeHtml(c.name)}</td>
      <td class="num">${c.product_count}</td>
      <td style="max-width:260px;">${escapeHtml(c.description || '—')}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick="editCategory(${c.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id})">Delete</button>
      </td>
    </tr>`).join('');
}

function renderCategoryDropdown(categories) {
  const select = document.getElementById('pCategory');
  select.innerHTML = '<option value="">Uncategorized</option>' +
    categories.map(c => `<option value="${c.id}">${c.icon || ''} ${escapeHtml(c.name)}</option>`).join('');
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
    const id = document.getElementById('categoryId').value;
    const payload = {
      name: document.getElementById('cName').value,
      icon: document.getElementById('cIcon').value,
      description: document.getElementById('cDescription').value
    };
    const msgBox = document.getElementById('categoryFormMsg');
    try {
      if (id) await API.put(`/api/categories/${id}`, payload);
      else await API.post('/api/categories', payload);
      closeModal();
      loadCategories();
    } catch (err) {
      msgBox.textContent = err.message;
      msgBox.className = 'form-msg error';
      msgBox.style.display = 'block';
    }
  });
}

function resetCategoryForm() {
  document.getElementById('categoryForm').reset();
  document.getElementById('categoryId').value = '';
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('categoryFormMsg').style.display = 'none';
}

window.editCategory = function (id) {
  const c = allCategories.find(c => c.id === id);
  if (!c) return;
  document.getElementById('categoryId').value = c.id;
  document.getElementById('cName').value = c.name;
  document.getElementById('cIcon').value = c.icon || '';
  document.getElementById('cDescription').value = c.description || '';
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

// ---------- Products: load + table ----------
async function loadProducts() {
  try {
    const { items } = await API.get('/api/products?perPage=100&sort=newest');
    renderProductsTable(items);
  } catch (err) {
    document.getElementById('productsTableBody').innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderProductsTable(items) {
  const body = document.getElementById('productsTableBody');
  if (!items.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">No products yet — click "Add product" to publish your first one.</td></tr>'; return; }
  body.innerHTML = items.map(p => `
    <tr>
      <td style="display:flex;align-items:center;gap:10px;">
        <img class="table-thumb" src="${(p.images && p.images[0]) || '/images/placeholder-product.svg'}" alt="" />
        <span>${escapeHtml(p.name)}</span>
      </td>
      <td>${escapeHtml(p.category_name || 'Uncategorized')}</td>
      <td class="num">₦${Number(p.final_price).toLocaleString()}</td>
      <td>${availabilityPill(p.availability)}</td>
      <td>
        ${p.is_featured ? '<span class="pill pill-gold">Featured</span> ' : ''}
        ${p.is_deal ? '<span class="pill pill-blue">Deal</span>' : ''}
      </td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" onclick='editProduct(${p.id})'>Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button>
      </td>
    </tr>`).join('');
}

function availabilityPill(status) {
  if (status === 'out_of_stock') return '<span class="pill pill-red">Out of stock</span>';
  if (status === 'limited') return '<span class="pill pill-gold">Limited</span>';
  return '<span class="pill pill-green">In stock</span>';
}

// ---------- Product modal ----------
function bindProductModal() {
  const overlay = document.getElementById('productModalOverlay');
  const openModal = () => overlay.classList.add('open');
  const closeModal = () => { overlay.classList.remove('open'); resetProductForm(); };

  document.getElementById('addProductBtn').addEventListener('click', () => { resetProductForm(); openModal(); });
  document.getElementById('productModalClose').addEventListener('click', closeModal);
  document.getElementById('cancelProductBtn').addEventListener('click', closeModal);
  document.getElementById('addSpecRow').addEventListener('click', () => addSpecRow());

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('productId').value;
    const msgBox = document.getElementById('productFormMsg');

    const formData = new FormData();
    formData.append('name', document.getElementById('pName').value);
    formData.append('description', document.getElementById('pDescription').value);
    formData.append('price', document.getElementById('pPrice').value);
    formData.append('discount_percent', document.getElementById('pDiscount').value || 0);
    formData.append('category_id', document.getElementById('pCategory').value);
    formData.append('availability', document.getElementById('pAvailability').value);
    formData.append('affiliate_link', document.getElementById('pLink').value);
    formData.append('is_featured', document.getElementById('pFeatured').checked);
    formData.append('is_deal', document.getElementById('pDeal').checked);
    formData.append('specifications', JSON.stringify(collectSpecs()));
    formData.append('existing_images', JSON.stringify(existingImagesForEdit));

    const files = document.getElementById('pImages').files;
    for (let i = 0; i < files.length; i++) formData.append('images', files[i]);

    try {
      if (id) await API.upload(`/api/products/${id}`, formData, 'PUT');
      else await API.upload('/api/products', formData, 'POST');
      closeModal();
      loadProducts();
      loadOverview();
    } catch (err) {
      msgBox.textContent = err.message;
      msgBox.className = 'form-msg error';
      msgBox.style.display = 'block';
    }
  });
}

function resetProductForm() {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('productFormMsg').style.display = 'none';
  document.getElementById('specRows').innerHTML = '';
  document.getElementById('existingImages').innerHTML = '';
  existingImagesForEdit = [];
  addSpecRow();
}

function addSpecRow(key = '', value = '') {
  const wrap = document.getElementById('specRows');
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `
    <input type="text" placeholder="Spec name (e.g. Battery Life)" class="spec-key" value="${escapeHtml(key)}" />
    <input type="text" placeholder="Value (e.g. 30 hours)" class="spec-value" value="${escapeHtml(value)}" />
    <button type="button" class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

function collectSpecs() {
  const specs = {};
  document.querySelectorAll('.spec-row').forEach(row => {
    const k = row.querySelector('.spec-key').value.trim();
    const v = row.querySelector('.spec-value').value.trim();
    if (k) specs[k] = v;
  });
  return specs;
}

window.editProduct = async function (id) {
  try {
    const { product } = await API.get(`/api/products/${id}`);
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('pName').value = product.name;
    document.getElementById('pDescription').value = product.description || '';
    document.getElementById('pPrice').value = product.price;
    document.getElementById('pDiscount').value = product.discount_percent || 0;
    document.getElementById('pCategory').value = product.category_id || '';
    document.getElementById('pAvailability').value = product.availability;
    document.getElementById('pLink').value = product.affiliate_link;
    document.getElementById('pFeatured').checked = product.is_featured;
    document.getElementById('pDeal').checked = product.is_deal;

    document.getElementById('specRows').innerHTML = '';
    const specs = product.specifications || {};
    if (Object.keys(specs).length) {
      Object.entries(specs).forEach(([k, v]) => addSpecRow(k, v));
    } else {
      addSpecRow();
    }

    existingImagesForEdit = product.images || [];
    renderExistingImages();

    document.getElementById('productModalOverlay').classList.add('open');
  } catch (err) { alert(err.message); }
};

function renderExistingImages() {
  const wrap = document.getElementById('existingImages');
  wrap.innerHTML = existingImagesForEdit.map((img, i) => `
    <div class="image-preview">
      <img src="${img}" alt="" />
      <button type="button" onclick="removeExistingImage(${i})">✕</button>
    </div>`).join('');
}

window.removeExistingImage = function (index) {
  existingImagesForEdit.splice(index, 1);
  renderExistingImages();
};

window.deleteProduct = async function (id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try {
    await API.del(`/api/products/${id}`);
    loadProducts();
    loadOverview();
  } catch (err) { alert(err.message); }
};

// ---------- Messages / Subscribers ----------
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
      </tr>`).join('') : '<tr><td colspan="4" class="empty-state">No messages yet.</td></tr>';
  } catch (err) {
    document.getElementById('messagesTableBody').innerHTML = `<tr><td colspan="4" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadSubscribers() {
  try {
    const { subscribers } = await API.get('/api/contact/subscribers');
    const body = document.getElementById('subscribersTableBody');
    body.innerHTML = subscribers.length ? subscribers.map(s => `
      <tr><td>${escapeHtml(s.email)}</td><td style="color:var(--gray-500);font-size:0.8rem;">${new Date(s.created_at).toLocaleString()}</td></tr>
    `).join('') : '<tr><td colspan="2" class="empty-state">No subscribers yet.</td></tr>';
  } catch (err) {
    document.getElementById('subscribersTableBody').innerHTML = `<tr><td colspan="2" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
