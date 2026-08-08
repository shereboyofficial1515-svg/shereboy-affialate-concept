// public/js/main.js
// Shared behavior included on every public page: mobile nav toggle,
// dynamic footer year, active nav highlighting, and the newsletter form.

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // Highlight current page in nav
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  // Footer year
  document.querySelectorAll('.footer-year').forEach(el => { el.textContent = new Date().getFullYear(); });

  // Newsletter subscribe form (appears on multiple pages)
  document.querySelectorAll('.newsletter-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value;
      const msgBox = form.parentElement.querySelector('.form-msg') || createMsgBox(form);
      try {
        const data = await API.post('/api/contact/subscribe', { email });
        showMsg(msgBox, data.message, 'success');
        form.reset();
      } catch (err) {
        showMsg(msgBox, err.message, 'error');
      }
    });
  });

  function createMsgBox(form) {
    const box = document.createElement('div');
    box.className = 'form-msg';
    box.style.display = 'none';
    form.after(box);
    return box;
  }

  function showMsg(box, text, type) {
    box.textContent = text;
    box.className = `form-msg ${type}`;
    box.style.display = 'block';
  }
});
