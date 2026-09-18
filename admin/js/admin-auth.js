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
      const data = await API.post('/api/auth/login', { email, password });
      // Also keep the token in sessionStorage as a fallback for the
      // Authorization header, in case third-party cookies are blocked.
      sessionStorage.setItem('shereboy_admin_token', data.token);
      window.location.href = '/admin/dashboard.html';
    } catch (err) {
      setFormMessage(msgBox, err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
});
