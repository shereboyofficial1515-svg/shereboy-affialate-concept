// admin/js/admin-auth.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msgBox = document.getElementById('loginMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const data = await API.post('/api/auth/login', { email, password });
      // Also keep the token in sessionStorage as a fallback for the
      // Authorization header, in case third-party cookies are blocked.
      sessionStorage.setItem('shereboy_admin_token', data.token);
      window.location.href = '/admin/dashboard.html';
    } catch (err) {
      msgBox.textContent = err.message;
      msgBox.className = 'form-msg error';
      msgBox.style.display = 'block';
    }
  });
});
