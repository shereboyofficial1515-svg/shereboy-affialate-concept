// controllers/contactController.js
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { notifyAdmin } = require('../services/email/notifications');

exports.sendMessage = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;
  const { error } = await supabaseAdmin
    .from('contact_messages')
    .insert({ name, email, subject: subject || 'General enquiry', message });
  if (error) throw new Error(`Failed to save message: ${error.message}`);
  notifyAdmin('notify_contact_message', `New message: ${String(subject || 'General enquiry').slice(0, 100)}`, `From ${name} <${email}>\n\n${message}`, email);
  res.status(201).json({ success: true, message: 'Thanks for reaching out — we\'ll reply within 1-2 business days.' });
});

exports.listMessages = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  res.json({ success: true, messages: data || [] });
});

// Subscriber management lives in emailAdminController.js
