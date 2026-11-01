// controllers/aiController.js
const { askAssistant } = require('../services/geminiService');

exports.chat = async (req, res) => {
  const { message, history } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Please type a question for the assistant.' });
  }
  if (message.length > 800) {
    return res.status(400).json({ success: false, message: 'Please keep your question under 800 characters.' });
  }
  // Each request is billed by size: only short, well-formed history is forwarded
  const safeHistory = (Array.isArray(history) ? history.slice(-10) : [])
    .filter(h => h && typeof h.text === 'string')
    .map(h => ({ role: h.role, text: h.text.slice(0, 800) }));

  try {
    const result = await askAssistant(message.trim(), safeHistory);
    res.json({ success: true, reply: result.reply, configured: result.configured });
  } catch (err) {
    console.error('Gemini assistant error:', err.message);
    res.status(502).json({
      success: false,
      message: "The assistant couldn't reach Gemini right now. Please try again shortly."
    });
  }
};
