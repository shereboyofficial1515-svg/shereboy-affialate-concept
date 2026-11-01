// public/js/newsletter-status.js
// Powers the confirm and unsubscribe pages. Both wait for a press of the button:
// mail security scanners open every link in an email, so merely loading a page
// must never confirm or unsubscribe anybody.
document.addEventListener('DOMContentLoaded', () => {
  const card = document.getElementById('statusCard');
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const button = document.getElementById('statusAction');
  const title = document.getElementById('statusTitle');
  const text = document.getElementById('statusText');
  const badge = document.getElementById('statusIcon');

  function finish(success, heading, message) {
    title.textContent = heading;
    text.textContent = message;
    badge.innerHTML = icon(success ? 'check' : 'warning');
    badge.classList.toggle('is-error', !success);
    button.hidden = true;
    document.getElementById('statusHome').hidden = false;
  }

  badge.innerHTML = icon('messages');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    finish(false, 'This link is not valid', 'Please use the link from your email. If it still fails, subscribe again from our homepage.');
    return;
  }

  button.addEventListener('click', async () => {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'One moment…';
    try {
      const data = await API.post(card.dataset.endpoint, { token });
      finish(true, card.dataset.doneTitle, data.message);
    } catch (err) {
      button.disabled = false;
      button.textContent = label;
      text.textContent = err.message;
      if (/not valid|expired/i.test(err.message)) finish(false, 'That didn’t work', err.message);
    }
  });
});
