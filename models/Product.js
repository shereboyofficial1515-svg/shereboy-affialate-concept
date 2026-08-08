// models/Product.js
// Data-access layer for products, backed by Supabase (Postgres). Handles
// search, category filtering, sorting, and pagination via the
// @supabase/supabase-js query builder instead of raw SQL.

const { supabaseAdmin } = require('../config/supabase');
const slugify = require('slugify');

function throwIfError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// Flattens the nested `category` join into category_name/category_slug
// (matching the shape the frontend already expects) and derives final_price.
// Postgres jsonb columns (images/specifications) already come back as real
// JS arrays/objects — no manual JSON.parse needed like the old SQLite layer.
function parseRow(row) {
  if (!row) return row;
  const { category, ...rest } = row;
  return {
    ...rest,
    images: rest.images || [],
    specifications: rest.specifications || {},
    is_featured: !!rest.is_featured,
    is_deal: !!rest.is_deal,
    category_name: category ? category.name : null,
    category_slug: category ? category.slug : null,
    final_price: +(rest.price * (1 - (rest.discount_percent || 0) / 100)).toFixed(2)
  };
}

const SORT_MAP = {
  newest: { column: 'date_added', ascending: false },
  price_asc: { column: 'price', ascending: true },
  price_desc: { column: 'price', ascending: false },
  name_asc: { column: 'name', ascending: true }
};

const Product = {
  /**
   * List products with optional search / filter / sort / pagination.
   * options: { q, category, sort, page, perPage, featuredOnly, dealOnly }
   */
  async list(options = {}) {
    const {
      q = '',
      category = '',
      sort = 'newest',
      page = 1,
      perPage = 12,
      featuredOnly = false,
      dealOnly = false
    } = options;

    // Filtering by the joined category's slug requires an INNER join
    // (the `!inner` modifier) so Postgres can filter on it; otherwise we
    // use a normal left join so uncategorized products still show up.
    const selectCols = category
      ? '*, category:categories!inner(name, slug)'
      : '*, category:categories(name, slug)';

    let query = supabaseAdmin.from('products').select(selectCols, { count: 'exact' });

    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    if (category) query = query.eq('category.slug', category);
    if (featuredOnly) query = query.eq('is_featured', true);
    if (dealOnly) query = query.eq('is_deal', true);

    const { column, ascending } = SORT_MAP[sort] || SORT_MAP.newest;
    query = query.order(column, { ascending });

    const currentPage = Math.max(1, Number(page) || 1);
    const size = Number(perPage) || 12;
    const from = (currentPage - 1) * size;
    const to = from + size - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    throwIfError(error, 'Failed to list products');

    const total = count || 0;
    return {
      items: (data || []).map(parseRow),
      total,
      page: currentPage,
      perPage: size,
      totalPages: Math.max(1, Math.ceil(total / size))
    };
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, category:categories(name, slug)')
      .eq('id', id)
      .maybeSingle();
    throwIfError(error, 'Failed to load product');
    return parseRow(data);
  },

  async findBySlug(slug) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, category:categories(name, slug)')
      .eq('slug', slug)
      .maybeSingle();
    throwIfError(error, 'Failed to load product');
    return parseRow(data);
  },

  async related(categoryId, excludeId, limit = 4) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, category:categories(name, slug)')
      .eq('category_id', categoryId)
      .neq('id', excludeId)
      .order('date_added', { ascending: false })
      .limit(limit);
    throwIfError(error, 'Failed to load related products');
    return (data || []).map(parseRow);
  },

  async create(data) {
    const slug = slugify(`${data.name}-${Date.now()}`, { lower: true, strict: true });
    const { data: inserted, error } = await supabaseAdmin
      .from('products')
      .insert({
        name: data.name,
        slug,
        description: data.description || '',
        specifications: data.specifications || {},
        price: data.price,
        discount_percent: data.discount_percent || 0,
        category_id: data.category_id || null,
        affiliate_link: data.affiliate_link,
        availability: data.availability || 'in_stock',
        is_featured: !!data.is_featured,
        is_deal: !!data.is_deal,
        images: data.images || []
      })
      .select('*, category:categories(name, slug)')
      .single();
    throwIfError(error, 'Failed to create product');
    return parseRow(inserted);
  },

  async update(id, data) {
    const existing = await this.findById(id);
    if (!existing) return null;

    const { data: updated, error } = await supabaseAdmin
      .from('products')
      .update({
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        specifications: data.specifications ?? existing.specifications,
        price: data.price ?? existing.price,
        discount_percent: data.discount_percent ?? existing.discount_percent,
        category_id: data.category_id ?? existing.category_id,
        affiliate_link: data.affiliate_link ?? existing.affiliate_link,
        availability: data.availability ?? existing.availability,
        is_featured: data.is_featured !== undefined ? !!data.is_featured : existing.is_featured,
        is_deal: data.is_deal !== undefined ? !!data.is_deal : existing.is_deal,
        images: data.images ?? existing.images
      })
      .eq('id', id)
      .select('*, category:categories(name, slug)')
      .single();
    throwIfError(error, 'Failed to update product');
    return parseRow(updated);
  },

  async remove(id) {
    const { error } = await supabaseAdmin.from('products').delete().eq('id', id);
    throwIfError(error, 'Failed to delete product');
    return true;
  },

  async stats() {
    const count = async (filters = {}) => {
      let query = supabaseAdmin.from('products').select('*', { count: 'exact', head: true });
      Object.entries(filters).forEach(([col, val]) => { query = query.eq(col, val); });
      const { count, error } = await query;
      throwIfError(error, 'Failed to load product stats');
      return count || 0;
    };

    const { count: totalCategories, error: catErr } = await supabaseAdmin
      .from('categories')
      .select('*', { count: 'exact', head: true });
    throwIfError(catErr, 'Failed to count categories');

    const [totalProducts, featured, deals, outOfStock] = await Promise.all([
      count(),
      count({ is_featured: true }),
      count({ is_deal: true }),
      count({ availability: 'out_of_stock' })
    ]);

    return { totalProducts, totalCategories: totalCategories || 0, featured, deals, outOfStock };
  }
};

module.exports = Product;
