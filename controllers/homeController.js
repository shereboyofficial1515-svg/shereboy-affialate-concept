// controllers/homeController.js
// One request for everything the homepage shows. Sections fail independently
// (one query failing doesn't blank the page) and a product appears in only one
// section, so a small catalog doesn't look like the same few items repeated.

const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { cardProduct } = require('../services/productView');
const settings = require('../services/settings');

const SECTION_SIZE = 4;
const CACHE_MS = 60 * 1000;
const TRENDING_DAYS = 30;
const TRENDING_MIN_CLICKS = 2; // a single click isn't a trend

let cache = null;

/** Called after any product or category change so edits show up immediately. */
function invalidateHomeCache() {
  cache = null;
}

async function settled(promise, fallback, label) {
  try {
    return await promise;
  } catch (err) {
    console.error(`[home] ${label} unavailable:`, err.message);
    return fallback;
  }
}

/** Most-clicked products over the last 30 days. Empty until there are real clicks. */
async function trending(limit) {
  const since = new Date(Date.now() - TRENDING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('product_clicks').select('product_id').gte('created_at', since).limit(10000);
  if (error) throw new Error(error.message);

  const counts = new Map();
  (data || []).forEach(({ product_id: id }) => counts.set(id, (counts.get(id) || 0) + 1));
  const ids = [...counts.entries()]
    .filter(([, clicks]) => clicks >= TRENDING_MIN_CLICKS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  const rows = await Promise.all(ids.map((id) => Product.findById(id)));
  return rows.filter((p) => p && p.status === 'published');
}

async function publishedTestimonials() {
  const { data, error } = await supabaseAdmin
    .from('testimonials').select('id, customer_name, quote, rating, created_at')
    .eq('is_published', true).order('created_at', { ascending: false }).limit(6);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Banners currently switched on and inside their date range. */
async function activeBanners() {
  const { data, error } = await supabaseAdmin
    .from('banners').select('id, title, message, image_url, link_url, placement, sort_order, starts_at, ends_at')
    .eq('is_active', true).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const now = new Date();
  return (data || []).filter((b) => (!b.starts_at || new Date(b.starts_at) <= now) && (!b.ends_at || new Date(b.ends_at) >= now));
}

/** The administrator's hand-picked products, in their order; otherwise the Featured flag. */
async function featuredProducts(ids) {
  if (!ids || !ids.length) return (await Product.list({ featuredOnly: true, perPage: 12 })).items;
  const rows = await Promise.all(ids.map((id) => Product.findById(id)));
  return rows.filter((p) => p && p.status === 'published');
}

async function buildHome() {
  const noProducts = { items: [], total: 0 };
  const { homepage } = await settings.loadAll();
  const [featuredItems, deals, recent, savings, clicked, categories, testimonials, banners] = await Promise.all([
    settled(featuredProducts(homepage.featured_product_ids), [], 'featured'),
    settled(Product.list({ dealOnly: true, perPage: 16 }), noProducts, 'deals'),
    settled(Product.list({ perPage: 24 }), null, 'recent'),
    settled(Product.list({ sort: 'discount_desc', perPage: 24 }), noProducts, 'savings'),
    settled(trending(16), [], 'trending'),
    settled(Category.all(), null, 'categories'),
    settled(publishedTestimonials(), [], 'testimonials'),
    settled(activeBanners(), [], 'banners')
  ]);
  const featured = { items: featuredItems };

  const shown = new Set();
  const take = (items, keep = () => true) => {
    const picked = [];
    for (const p of items) {
      if (picked.length === SECTION_SIZE) break;
      if (!shown.has(p.id) && keep(p)) {
        shown.add(p.id);
        picked.push(cardProduct(p));
      }
    }
    return picked;
  };

  const sections = {
    featured: take(featured.items),
    deals: take(deals.items),
    trending: take(clicked),
    recent: take(recent ? recent.items : []),
    recommended: take(savings.items, (p) => p.discount_percent > 0)
  };

  return {
    success: true,
    ...sections,
    // The hero shows real products from these same lists, preferring ones with photos
    spotlight: [...(featured.items), ...(deals.items), ...(recent ? recent.items : [])]
      .map(cardProduct)
      .filter((p, i, all) => !p.images_missing && all.findIndex((o) => o.id === p.id) === i)
      .slice(0, 3),
    categories: categories === null ? null : categories
      .filter((c) => c.product_count > 0)
      .map(({ id, name, slug, icon, image_url, product_count }) => ({ id, name, slug, icon, image_url, product_count })),
    testimonials,
    banners,
    sections: homepage.sections,
    stats: {
      products: recent ? recent.total : null,
      categories: categories === null ? null : categories.filter((c) => c.product_count > 0).length
    },
    // Lets the page tell "nothing here yet" from "couldn't load"
    degraded: recent === null
  };
}

exports.home = asyncHandler(async (req, res) => {
  if (!cache || Date.now() > cache.expires) {
    const payload = await buildHome();
    cache = payload.degraded ? null : { payload, expires: Date.now() + CACHE_MS };
    res.set('Cache-Control', payload.degraded ? 'no-store' : 'public, max-age=30');
    return res.status(payload.degraded ? 503 : 200).json(
      payload.degraded ? { success: false, message: 'Products are temporarily unavailable. Please try again shortly.' } : payload
    );
  }
  res.set('Cache-Control', 'public, max-age=30');
  res.json(cache.payload);
});

exports.invalidateHomeCache = invalidateHomeCache;
