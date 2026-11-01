// controllers/testimonialController.js
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { invalidateHomeCache } = require('./homeController');

const COLUMNS = 'id, customer_name, quote, rating, is_published, created_at';

function readTestimonial(body) {
  const customer_name = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const quote = typeof body.quote === 'string' ? body.quote.trim() : '';
  const rating = Number(body.rating);
  const errors = [];
  if (customer_name.length < 2 || customer_name.length > 100) errors.push('Customer name must be 2-100 characters.');
  if (quote.length < 5 || quote.length > 1000) errors.push('Quote must be 5-1,000 characters.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('Rating must be a whole number from 1 to 5.');
  return { fields: { customer_name, quote, rating, is_published: body.is_published !== false }, errors };
}

// Public: only what has been published
exports.list = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('testimonials')
    .select('id, customer_name, quote, rating, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(`Failed to load testimonials: ${error.message}`);
  res.json({ success: true, testimonials: data || [] });
});

exports.listAll = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('testimonials').select(COLUMNS).order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load testimonials: ${error.message}`);
  res.json({ success: true, testimonials: data || [] });
});

exports.create = asyncHandler(async (req, res) => {
  const { fields, errors } = readTestimonial(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });
  const { data, error } = await supabaseAdmin.from('testimonials').insert(fields).select(COLUMNS).single();
  if (error) throw new Error(`Failed to save testimonial: ${error.message}`);
  invalidateHomeCache();
  res.status(201).json({ success: true, message: 'Testimonial saved.', testimonial: data });
});

exports.update = asyncHandler(async (req, res) => {
  const { fields, errors } = readTestimonial(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });
  const { data, error } = await supabaseAdmin.from('testimonials').update(fields).eq('id', req.params.id).select(COLUMNS).maybeSingle();
  if (error) throw new Error(`Failed to save testimonial: ${error.message}`);
  if (!data) return res.status(404).json({ success: false, message: 'Testimonial not found.' });
  invalidateHomeCache();
  res.json({ success: true, message: 'Testimonial saved.', testimonial: data });
});

exports.remove = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.from('testimonials').delete().eq('id', req.params.id);
  if (error) throw new Error(`Failed to delete testimonial: ${error.message}`);
  invalidateHomeCache();
  res.json({ success: true, message: 'Testimonial deleted.' });
});
