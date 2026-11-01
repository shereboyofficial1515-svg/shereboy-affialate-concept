// controllers/productController.js
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { storeImages, deleteImages } = require('../services/imageStorage');
const { notifyPartners } = require('../services/partnerWebhook');

exports.list = asyncHandler(async (req, res) => {
  const { q, category, sort, page, featured, deal } = req.query;
  const result = await Product.list({
    q,
    category,
    sort,
    page: page ? Number(page) : 1,
    featuredOnly: featured === 'true',
    dealOnly: deal === 'true'
  });
  res.json({ success: true, ...result });
});

exports.getBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findBySlug(req.params.slug);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
  const related = product.category_id ? await Product.related(product.category_id, product.id) : [];
  res.json({ success: true, product, related });
});

exports.getById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
  res.json({ success: true, product });
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
    images
  });

  notifyPartners('product.created', product);
  res.status(201).json({ success: true, message: 'Product published.', product });
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
    description: req.body.description,
    specifications,
    price: req.body.price !== undefined ? Number(req.body.price) : undefined,
    discount_percent: req.body.discount_percent !== undefined ? Number(req.body.discount_percent) : undefined,
    category_id: req.body.category_id || null,
    affiliate_link: req.body.affiliate_link,
    availability: req.body.availability,
    is_featured: req.body.is_featured !== undefined ? (req.body.is_featured === 'true' || req.body.is_featured === true) : undefined,
    is_deal: req.body.is_deal !== undefined ? (req.body.is_deal === 'true' || req.body.is_deal === true) : undefined,
    images: [...keepImages, ...newImages]
  });

  // Clean up images the admin removed from this product
  deleteImages(existing.images.filter(img => !keepImages.includes(img))).catch(() => {});
  notifyPartners('product.updated', product);
  res.json({ success: true, message: 'Product updated.', product });
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await Product.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Product not found.' });

  await Product.remove(req.params.id);
  // Clean up the images that belonged to this product (best-effort)
  deleteImages(existing.images).catch(() => {});
  notifyPartners('product.deleted', existing);
  res.json({ success: true, message: 'Product deleted.' });
});

exports.stats = asyncHandler(async (req, res) => {
  const stats = await Product.stats();
  res.json({ success: true, stats });
});
