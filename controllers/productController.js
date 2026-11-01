// controllers/productController.js
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { storeImages, deleteImages } = require('../services/imageStorage');
const { notifyPartners } = require('../services/partnerWebhook');
const { publicProduct } = require('../services/productView');
const { cleanHtml } = require('../services/richText');
const { supabaseAdmin } = require('../config/supabase');
const { invalidateHomeCache } = require('./homeController');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

// A rating is either complete and real, or absent. Never a default.
function readRating(body) {
  if (body.rating === undefined && body.rating_count === undefined) return {};
  const rating = body.rating === '' || body.rating === undefined ? null : Number(body.rating);
  const count = body.rating_count === '' || body.rating_count === undefined ? null : Number(body.rating_count);
  return rating === null || count === null ? { rating: null, rating_count: null } : { rating, rating_count: count };
}

const readVerified = (body) => (body.is_verified === undefined ? {} : { is_verified: body.is_verified === 'true' || body.is_verified === true });

exports.list = asyncHandler(async (req, res) => {
  const { q, category, sort, page, perPage, featured, deal } = req.query;
  const result = await Product.list({
    q: text(q, 80),
    category: SLUG_RE.test(text(category, 120)) ? category : '',
    sort: typeof sort === 'string' ? sort : undefined,
    page: Math.min(Math.max(1, Number(page) || 1), 100000),
    perPage: Math.min(Math.max(1, Number(perPage) || 12), 100),
    featuredOnly: featured === 'true',
    dealOnly: deal === 'true'
  });
  res.json({ success: true, ...result, items: result.items.map(publicProduct) });
});

exports.getBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findBySlug(req.params.slug);
  if (!product || product.status !== 'published') return res.status(404).json({ success: false, message: 'Product not found.' });
  const related = product.category_id ? await Product.related(product.category_id, product.id) : [];
  res.json({ success: true, product: publicProduct(product), related: related.map(publicProduct) });
});

exports.getById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product || product.status !== 'published') return res.status(404).json({ success: false, message: 'Product not found.' });
  res.json({ success: true, product: publicProduct(product) });
});

// Counts a click through to the retailer, for the "Trending" section. The row
// holds only the product and the time. Failures never affect the visitor.
exports.recordClick = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.from('product_clicks').insert({ product_id: req.params.id });
  if (error) console.warn('[clicks] not recorded:', error.message);
  res.status(204).end();
});

exports.create = asyncHandler(async (req, res) => {
  const images = await storeImages(req.files);
  let specifications = {};
  try {
    specifications = req.body.specifications ? JSON.parse(req.body.specifications) : {};
  } catch (e) { /* keep as empty object if malformed */ }

  const product = await Product.create({
    name: req.body.name,
    description: req.body.description,
    specifications,
    price: Number(req.body.price),
    discount_percent: Number(req.body.discount_percent) || 0,
    category_id: req.body.category_id || null,
    affiliate_link: req.body.affiliate_link,
    availability: req.body.availability || 'in_stock',
    is_featured: req.body.is_featured === 'true' || req.body.is_featured === true,
    is_deal: req.body.is_deal === 'true' || req.body.is_deal === true,
    images,
    status: 'published',
    ...readVerified(req.body),
    ...readRating(req.body)
  });

  invalidateHomeCache();
  notifyPartners('product.created', product);
  res.status(201).json({ success: true, message: 'Product published.', product: publicProduct(product) });
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await Product.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Product not found.' });

  let keepImages = existing.images;
  if (req.body.existing_images) {
    try { keepImages = JSON.parse(req.body.existing_images); } catch (e) { /* keep original */ }
  }
  // Only images this product already had can be kept (never arbitrary paths)
  keepImages = (Array.isArray(keepImages) ? keepImages : []).filter(img => existing.images.includes(img));
  const newImages = await storeImages(req.files);

  let specifications = existing.specifications;
  if (req.body.specifications) {
    try { specifications = JSON.parse(req.body.specifications); } catch (e) { /* ignore */ }
  }

  const product = await Product.update(req.params.id, {
    name: req.body.name,
    // Formatted descriptions are displayed as HTML, so only clean HTML may be stored
    description: existing.description_format === 'html' && req.body.description !== undefined ? cleanHtml(req.body.description) : req.body.description,
    specifications,
    price: req.body.price !== undefined ? Number(req.body.price) : undefined,
    discount_percent: req.body.discount_percent !== undefined ? Number(req.body.discount_percent) : undefined,
    category_id: req.body.category_id === undefined ? undefined : req.body.category_id || null,
    affiliate_link: req.body.affiliate_link,
    availability: req.body.availability,
    is_featured: req.body.is_featured !== undefined ? (req.body.is_featured === 'true' || req.body.is_featured === true) : undefined,
    is_deal: req.body.is_deal !== undefined ? (req.body.is_deal === 'true' || req.body.is_deal === true) : undefined,
    images: [...keepImages, ...newImages],
    ...readVerified(req.body),
    ...readRating(req.body)
  });

  // Clean up images the admin removed from this product
  deleteImages(existing.images.filter(img => !keepImages.includes(img))).catch(() => {});
  invalidateHomeCache();
  notifyPartners('product.updated', product);
  res.json({ success: true, message: 'Product updated.', product: publicProduct(product) });
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await Product.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Product not found.' });

  await Product.remove(req.params.id);
  // Clean up the images that belonged to this product (best-effort)
  deleteImages(existing.images).catch(() => {});
  invalidateHomeCache();
  notifyPartners('product.deleted', existing);
  res.json({ success: true, message: 'Product deleted.' });
});

exports.stats = asyncHandler(async (req, res) => {
  const stats = await Product.stats();
  res.json({ success: true, stats });
});
