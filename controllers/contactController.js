// controllers/contactController.js
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');

exports.sendMessage = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;
  const { error } = await supabaseAdmin
    .from('contact_messages')
    .insert({ name, email, subject: subject || 'General enquiry', message });
  if (error) throw new Error(`Failed to save message: ${error.message}`);
  res.status(201).json({ success: true, message: 'Thanks for reaching out — we\'ll reply within 1-2 business days.' });
});

exports.subscribe = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const { error } = await supabaseAdmin.from('subscribers').insert({ email });

  if (error) {
    // Postgres unique-violation code is 23505
    if (error.code === '23505') {
      return res.status(200).json({ success: true, message: 'You\'re already subscribed — thanks!' });
    }
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }

  res.status(201).json({ success: true, message: 'You\'re subscribed! Watch your inbox for new deals.' });
});

exports.listMessages = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  res.json({ success: true, messages: data || [] });
});

exports.listSubscribers = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load subscribers: ${error.message}`);
  res.json({ success: true, subscribers: data || [] });
});
