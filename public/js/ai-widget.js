// public/js/ai-widget.js
// Powers the floating chat widget that talks to /api/ai/chat (Gemini).
// Runs after layout.js injects the widget markup into #ai-widget.

let aiHistory = [];

document.addEventListener('layout:ready', () => {
  const fab = document.getElementById('aiFab');
  const panel = document.getElementById('aiPanel');
  const closeBtn = document.getElementById('aiClose');
  const form = document.getElementById('aiForm');
  const input = document.getElementById('aiInput');
  const body = document.getElementById('aiBody');
  const typing = document.getElementById('aiTyping');

  if (!fab) return; // widget not present on this page

  fab.addEventListener('click', () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    appendMessage(message, 'user');
    aiHistory.push({ role: 'user', text: message });
    input.value = '';
    typing.style.display = 'block';
    body.scrollTop = body.scrollHeight;

    try {
      const data = await API.post('/api/ai/chat', { message, history: aiHistory });
      appendMessage(data.reply, 'bot');
      aiHistory.push({ role: 'assistant', text: data.reply });
    } catch (err) {
      appendMessage(err.message || "Sorry, I couldn't respond right now. Please try again.", 'bot');
    } finally {
      typing.style.display = 'none';
      body.scrollTop = body.scrollHeight;
    }
  });

  function appendMessage(text, who) {
    const div = document.createElement('div');
    div.className = `ai-msg ${who}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }
});
