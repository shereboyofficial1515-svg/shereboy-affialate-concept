// controllers/publicController.js
// Read-only public product feed for partner sites (e.g. the SHEREBOY TECH LTD
// company website). Returns clean, documented fields only — never internal
// columns, admin data or credentials — and never echoes database errors.
//
// Product destinations:
//   productUrl   — this product's page on SHEREBOY AFFILIATE CONCEPT
//   affiliateUrl — the partner-store tracking link exactly as entered by the
//                  admin (all query parameters preserved), or null if invalid

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { localUploadExists } = require('../services/imageStorage');

const MAX_PAGE_SIZE = 48;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AVAILABILITY = ['in_stock', 'limited', 'out_of_stock'];

function siteUrl() {
  return (process.env.PUBLIC_SITE_URL || 'https://shereboyaffiliateconcept.shop').replace(/\/+$/, '');
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function unavailable(error) {
  console.error('[public-api] database error:', error && error.message);
  const err = new Error('Products are temporarily unavailable. Please try again shortly.');
  err.status = 503;
  err.expose = true;
  return err;
}

/** Absolute https URL for a product image, or null if it can't be shown. */
function imageUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = raw.trim();
  if (value.startsWith('/uploads/')) {
    // Legacy local upload: only advertise it if the file still exists on disk
    return localUploadExists(value) ? `${siteUrl()}${value}` : null;
  }
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The admin-entered tracking link, returned byte-for-byte when it is a valid http(s) URL. */
function trackingUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? value : null;
  } catch {
    return null;
  }
}

function plainText(value, max) {
  const text = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
}

const { toPlainText } = require('../services/richText');
const settings = require('../services/settings');
const money = (n) => Math.round(Number(n) * 100) / 100;

function toPublic(row) {
  const price = Number(row.price);
  const discount = Math.min(Math.max(Number(row.discount_percent) || 0, 0), 100);
  const current = Number.isFinite(price) ? money(price * (1 - discount / 100)) : null;
  const previous = discount > 0 && Number.isFinite(price) && price > current ? money(price) : null;
  const images = (Array.isArray(row.images) ? row.images : []).map(imageUrl).filter(Boolean);
  const availability = AVAILABILITY.includes(row.availability) ? row.availability : 'in_stock';
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: plainText(toPlainText(row.description), 400),
    image: images[0] ? { url: images[0], alt: row.name } : null,
    images,
    category: row.category ? { name: row.category.name, slug: row.category.slug } : null,
    price: {
      current,
      previous,
      discountPercent: previous ? discount : 0,
      currency: settings.cached().regional.currency
    },
    isFeatured: !!row.is_featured,
    isDeal: !!row.is_deal,
    availability,
    isAvailable: availability !== 'out_of_stock',
    productUrl: `${siteUrl()}/product-details.html?slug=${encodeURIComponent(row.slug)}`,
    affiliateUrl: trackingUrl(row.affiliate_link),
    addedAt: row.date_added,
    // `updated_at` exists after database/migrations/001_products_updated_at.sql
    updatedAt: row.updated_at || row.date_added
  };
}

const SELECT = '*, category:categories(name, slug)';

function intParam(value, { name, min, max, fallback }) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw badRequest(`"${name}" must be a whole number.`);
  const n = Number(value);
  if (n < min || n > max) throw badRequest(`"${name}" must be between ${min} and ${max}.`);
  return n;
}

function boolParam(value, name) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest(`"${name}" must be true or false.`);
}

function setPublicCache(res) {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
}

/**
 * GET /api/public/products?page=1&pageSize=24&category=slug&q=text&featured=true&deal=true&available=true
 */
exports.listProducts = asyncHandler(async (req, res) => {
  const page = intParam(req.query.page, { name: 'page', min: 1, max: 1000, fallback: 1 });
  const pageSize = intParam(req.query.pageSize, { name: 'pageSize', min: 1, max: MAX_PAGE_SIZE, fallback: 24 });
  const featured = boolParam(req.query.featured, 'featured');
  const deal = boolParam(req.query.deal, 'deal');
  const available = boolParam(req.query.available, 'available');
  const { category } = req.query;
  if (category !== undefined && (typeof category !== 'string' || !SLUG_RE.test(category) || category.length > 120)) {
    throw badRequest('"category" must be a category slug.');
  }
  const q = typeof req.query.q === 'string' ? req.query.q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80) : '';

  let query = supabaseAdmin
    .from('products')
    .select(category ? '*, category:categories!inner(name, slug)' : SELECT, { count: 'exact' })
    .eq('status', 'published')
    .order('date_added', { ascending: false });
  if (category) query = query.eq('category.slug', category);
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  if (featured !== undefined) query = query.eq('is_featured', featured);
  if (deal !== undefined) query = query.eq('is_deal', deal);
  if (available === true) query = query.neq('availability', 'out_of_stock');
  if (available === false) query = query.eq('availability', 'out_of_stock');

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw unavailable(error);

  const total = count || 0;
  setPublicCache(res);
  res.json({
    success: true,
    data: {
      products: (data || []).map(toPublic),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    }
  });
});

/** GET /api/public/products/featured?limit=8 — products the admin marked as featured. */
exports.featuredProducts = asyncHandler(async (req, res) => {
  const limit = intParam(req.query.limit, { name: 'limit', min: 1, max: 24, fallback: 8 });
  const { data, error } = await supabaseAdmin
    .from('products').select(SELECT)
    .eq('status', 'published')
    .eq('is_featured', true)
    .order('date_added', { ascending: false })
    .limit(limit);
  if (error) throw unavailable(error);
  setPublicCache(res);
  res.json({ success: true, data: { products: (data || []).map(toPublic) } });
});

/** GET /api/public/products/:slug */
exports.getProduct = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  if (!SLUG_RE.test(slug) || slug.length > 200) throw badRequest('Invalid product slug.');
  const { data, error } = await supabaseAdmin.from('products').select(SELECT).eq('status', 'published').eq('slug', slug).maybeSingle();
  if (error) throw unavailable(error);
  if (!data) return res.status(404).json({ success: false, message: 'Product not found.' });
  setPublicCache(res);
  res.json({ success: true, data: { product: toPublic(data) } });
});

/** GET /api/public/categories — only categories that currently have products. */
exports.listCategories = asyncHandler(async (req, res) => {
  const [{ data: cats, error }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseAdmin.from('categories').select('id, name, slug').order('name'),
    supabaseAdmin.from('products').select('category_id').eq('status', 'published')
  ]);
  if (error || rowsError) throw unavailable(error || rowsError);
  const counts = {};
  (rows || []).forEach(r => { if (r.category_id != null) counts[r.category_id] = (counts[r.category_id] || 0) + 1; });
  setPublicCache(res);
  res.json({
    success: true,
    data: { categories: (cats || []).filter(c => counts[c.id]).map(c => ({ name: c.name, slug: c.slug, productCount: counts[c.id] })) }
  });
});

/** GET /api/public/status — lightweight connection check for partner sites. */
exports.status = asyncHandler(async (req, res) => {
  const count = async (build) => {
    const { count: n, error } = await build(supabaseAdmin.from('products').select('id', { count: 'exact', head: true }).eq('status', 'published'));
    if (error) throw unavailable(error);
    return n || 0;
  };
  const [total, featured, available] = await Promise.all([
    count(q => q),
    count(q => q.eq('is_featured', true)),
    count(q => q.neq('availability', 'out_of_stock'))
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: { platform: settings.cached().identity.site_name, siteUrl: siteUrl(), totalProducts: total, availableProducts: available, featuredProducts: featured, currency: settings.cached().regional.currency, serverTime: new Date().toISOString() }
  });
});

exports.toPublic = toPublic;
