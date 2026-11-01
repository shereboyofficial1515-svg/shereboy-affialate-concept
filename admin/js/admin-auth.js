// The logo and name chosen in General Settings
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SITE) return;
  const logo = document.querySelector('.login-brand img');
  if (window.SITE.logo) logo.src = window.SITE.logo;
  logo.alt = window.SITE.name;
  document.title = `Admin Login — ${window.SITE.name}`;
});

// admin/js/admin-auth.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msgBox = document.getElementById('loginMsg');
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitLabel = submitBtn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    msgBox.style.display = 'none';

    try {
      // The session lives in an httpOnly cookie that page scripts can't read
      await API.post('/api/auth/login', { email, password });
      window.location.href = '/admin/dashboard.html';
    } catch (err) {
      setFormMessage(msgBox, err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
});
