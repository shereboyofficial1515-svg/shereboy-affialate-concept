// public/js/main.js
// Shared behavior included on every public page: mobile nav toggle,
// dynamic footer year, active nav highlighting, and the newsletter form.

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
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
    const submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;

      const email = form.querySelector('input[type="email"]').value;
      const msgBox = form.parentElement.querySelector('.form-msg') || createMsgBox(form);
      const submitLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subscribing…';
      try {
        const data = await API.post('/api/contact/subscribe', { email });
        setFormMessage(msgBox, data.message, 'success');
        form.reset();
      } catch (err) {
        setFormMessage(msgBox, err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
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
});
