// public/js/categories-page.js
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) loadCategories();
  });
});

async function loadCategories() {
  const grid = document.getElementById('categoryGrid');
  try {
    const { categories } = await API.get('/api/categories');
    // A department with nothing in it is a dead end for a shopper
    grid.innerHTML = categories.filter(c => c.product_count > 0).map(categoryCardHTML).join('') ||
      emptyStateHTML("We're adding new products. Please check back soon.");
  } catch (err) {
    grid.innerHTML = errorStateHTML(`We couldn't load the categories. ${err.message}`);
  }
}
