// controllers/aiController.js
const { askAssistant } = require('../services/geminiService');

exports.chat = async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Please type a question for the assistant.' });
  }

  try {
    const result = await askAssistant(message.trim(), Array.isArray(history) ? history.slice(-10) : []);
    res.json({ success: true, reply: result.reply, configured: result.configured });
  } catch (err) {
    console.error('Gemini assistant error:', err.message);
    res.status(502).json({
      success: false,
      message: "The assistant couldn't reach Gemini right now. Please try again shortly."
    });
  }
};
