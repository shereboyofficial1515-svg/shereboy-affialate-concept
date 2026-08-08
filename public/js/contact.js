// public/js/contact.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const msgBox = document.getElementById('contactMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.value,
      email: form.email.value,
      subject: form.subject.value,
      message: form.message.value
    };

    try {
      const data = await API.post('/api/contact/message', payload);
      msgBox.textContent = data.message;
      msgBox.className = 'form-msg success';
      msgBox.style.display = 'block';
      form.reset();
    } catch (err) {
      msgBox.textContent = err.message;
      msgBox.className = 'form-msg error';
      msgBox.style.display = 'block';
    }
  });
});
