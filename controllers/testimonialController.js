// controllers/testimonialController.js
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('testimonials')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(`Failed to load testimonials: ${error.message}`);
  res.json({ success: true, testimonials: data || [] });
});
