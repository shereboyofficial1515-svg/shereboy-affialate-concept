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
  const path = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
  });

  // Keep what was searched for visible in the header box
  const navSearch = document.getElementById('navSearchInput');
  if (navSearch) navSearch.value = new URLSearchParams(window.location.search).get('q') || '';

  // Footer year
  document.querySelectorAll('.footer-year').forEach(el => { el.textContent = new Date().getFullYear(); });

  // Newsletter subscribe form
  document.querySelectorAll('.newsletter-form').forEach(form => {
    const submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;

      const emailInput = form.querySelector('input[type="email"]');
      const msgBox = form.querySelector('.form-msg') || createMsgBox(form);
      const email = emailInput.value.trim();
      if (!emailInput.checkValidity() || !email) {
        setFormMessage(msgBox, 'Please enter a valid email address.', 'error');
        emailInput.focus();
        return;
      }

      const submitLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subscribing…';
      try {
        const data = await API.post('/api/newsletter/subscribe', {
          email,
          website: form.querySelector('input[name="website"]').value,
          source: form.dataset.source
        });
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
    box.setAttribute('role', 'status');
    box.style.display = 'none';
    form.append(box);
    return box;
  }
});
