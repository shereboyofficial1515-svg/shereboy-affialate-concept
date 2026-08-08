// models/Category.js
// Data-access layer for categories, backed by Supabase (Postgres) instead
// of raw SQL. Every method is now async since it's a network call.

const { supabaseAdmin } = require('../config/supabase');
const slugify = require('slugify');

function throwIfError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const Category = {
  async all() {
    const { data: categories, error: catErr } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
    throwIfError(catErr, 'Failed to load categories');

    // Supabase's query builder doesn't do a simple GROUP BY count join, so
    // we count products per category in JS from a single lightweight query.
    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('category_id');
    throwIfError(prodErr, 'Failed to count products per category');

    const counts = {};
    (products || []).forEach(p => {
      if (p.category_id != null) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
    });

    return categories.map(c => ({ ...c, product_count: counts[c.id] || 0 }));
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    throwIfError(error, 'Failed to load category');
    return data;
  },

  async findBySlug(slug) {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    throwIfError(error, 'Failed to load category');
    return data;
  },

  async create({ name, icon, description }) {
    const slug = slugify(name, { lower: true, strict: true });
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({ name, slug, icon: icon || '🛍️', description: description || '' })
      .select()
      .single();
    throwIfError(error, 'Failed to create category');
    return data;
  },

  async update(id, { name, icon, description }) {
    const slug = slugify(name, { lower: true, strict: true });
    const { data, error } = await supabaseAdmin
      .from('categories')
      .update({ name, slug, icon: icon || '🛍️', description: description || '' })
      .eq('id', id)
      .select()
      .single();
    throwIfError(error, 'Failed to update category');
    return data;
  },

  async remove(id) {
    const { error } = await supabaseAdmin.from('categories').delete().eq('id', id);
    throwIfError(error, 'Failed to delete category');
    return true;
  }
};

module.exports = Category;
