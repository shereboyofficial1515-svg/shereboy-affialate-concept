// public/js/contact.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const msgBox = document.getElementById('contactMsg');
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitLabel = submitBtn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const payload = {
      name: form.name.value,
      email: form.email.value,
      subject: form.subject.value,
      message: form.message.value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

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
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
});
