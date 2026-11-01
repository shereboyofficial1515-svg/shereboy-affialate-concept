// public/js/categories-page.js
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('categoryGrid');
  try {
    const { categories } = await API.get('/api/categories');
    grid.innerHTML = categories.map(categoryCardHTML).join('') ||
      emptyStateHTML('No categories yet.');
  } catch (err) {
    grid.innerHTML = emptyStateHTML(`Couldn't load categories: ${err.message}`, 'warning');
  }
});
