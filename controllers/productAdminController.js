// controllers/productAdminController.js
// The publishing workflow. Edits are autosaved to the product's `draft` column;
// the live columns visitors see only change on Publish, so an original
// description stays intact until someone approves the change.

const slugify = require('slugify');
const validator = require('validator');
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const Product = require('../models/Product');
const { cleanHtml, toPlainText } = require('../services/richText');
const { publicProduct } = require('../services/productView');
const { usableImages, deleteImages } = require('../services/imageStorage');
const { notifyPartners } = require('../services/partnerWebhook');
const { audit } = require('../services/audit');
const { invalidateHomeCache } = require('./homeController');

const STATUSES = ['draft', 'pending_review', 'published', 'scheduled', 'archived'];
const SELECT = '*, category:categories(name, slug)';
const LINK_RULES = { require_protocol: true, protocols: ['http', 'https'] };

function clientError(message, status = 400, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  Object.assign(err, extra);
  return err;
}

async function load(id) {
  const product = await Product.findById(id);
  if (!product) throw clientError('Product not found.', 404);
  return product;
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * Accepts what a draft can hold. Drafts may be incomplete, but every value
 * present must still be safe and the right shape. Unknown fields are ignored.
 */
async function readFields(input, existing) {
  const out = {};
  const errors = {};
  const textField = (field, max) => {
    if (input[field] === undefined) return;
    if (typeof input[field] !== 'string') errors[field] = 'Must be text.';
    else if (input[field].length > max) errors[field] = `Must be ${max} characters or fewer.`;
    else out[field] = input[field];
  };
  textField('name', 200);
  textField('short_description', 500);
  textField('seo_title', 120);
  textField('seo_description', 320);
  textField('affiliate_link', 2000);
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > 100000) errors.description = 'Description is too long.';
    else out.description = cleanHtml(input.description);
  }
  for (const [field, min, max] of [['price', 0, 1e12], ['discount_percent', 0, 100]]) {
    if (input[field] === undefined) continue;
    const n = num(input[field]);
    if (n !== null && (!Number.isFinite(n) || n < min || n > max)) errors[field] = `Must be a number from ${min} to ${max}.`;
    else out[field] = n;
  }
  if (input.category_id !== undefined) {
    const id = num(input.category_id);
    if (id !== null && !Number.isInteger(id)) errors.category_id = 'Choose a category.';
    else out.category_id = id;
  }
  if (input.availability !== undefined) {
    if (!['in_stock', 'limited', 'out_of_stock'].includes(input.availability)) errors.availability = 'Choose an availability.';
    else out.availability = input.availability;
  }
  for (const field of ['is_featured', 'is_deal', 'is_verified']) {
    if (input[field] !== undefined) out[field] = input[field] === true;
  }
  if (input.rating !== undefined || input.rating_count !== undefined) {
    const rating = num(input.rating);
    const count = num(input.rating_count);
    if ((rating === null) !== (count === null)) errors.rating = 'Enter both the rating and the number of ratings, or leave both empty.';
    else if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) errors.rating = 'Rating must be between 0 and 5.';
    else if (count !== null && (!Number.isInteger(count) || count < 0)) errors.rating_count = 'Number of ratings must be a whole number.';
    else { out.rating = rating; out.rating_count = count; }
  }
  if (input.specifications !== undefined) {
    const specs = input.specifications;
    if (!specs || typeof specs !== 'object' || Array.isArray(specs) || Object.keys(specs).length > 100) errors.specifications = 'Attributes are not valid.';
    else out.specifications = Object.fromEntries(Object.entries(specs).map(([k, v]) => [String(k).slice(0, 100), String(v).slice(0, 500)]));
  }
  if (input.images !== undefined) {
    const images = input.images;
    if (!Array.isArray(images) || images.length > 20 || !images.every((u) => typeof u === 'string')) {
      errors.images = 'Images are not valid.';
    } else {
      // Only files in the media library, or ones this product already had
      const { data, error } = await supabaseAdmin.from('media').select('url').in('url', images.length ? images : ['']);
      if (error) throw new Error(`Failed to check images: ${error.message}`);
      const known = new Set([...(data || []).map((m) => m.url), ...((existing && existing.images) || [])]);
      if (!images.every((u) => known.has(u))) errors.images = 'Choose images from the media library.';
      else out.images = images;
    }
  }
  return { fields: out, errors };
}

/** What publishing requires: returned together so everything can be fixed at once. */
function publishErrors(p) {
  const errors = {};
  if (!p.name || String(p.name).trim().length < 3 || /^Untitled product/.test(p.name)) errors.name = 'Enter a product title of at least 3 characters.';
  if (!(Number(p.price) > 0)) errors.price = 'Enter a price above zero.';
  if (!p.affiliate_link || typeof p.affiliate_link !== 'string' || !validator.isURL(p.affiliate_link, LINK_RULES)) errors.affiliate_link = 'Enter a valid affiliate URL, including https://.';
  if (!toPlainText(p.description)) errors.description = 'Write a description.';
  if (!usableImages(p.images).length) errors.images = 'Add at least one image that can be displayed.';
  if (!(Number(p.discount_percent) >= 0 && Number(p.discount_percent) <= 100)) errors.discount_percent = 'Discount must be 0 to 100.';
  return errors;
}

const merged = (product) => ({ ...product, ...(product.draft || {}) });

function shape(product) {
  const view = merged(product);
  return { ...publicProduct(view), has_draft: !!product.draft, live_name: product.name };
}

function liveColumns(view) {
  const columns = ['name', 'short_description', 'description', 'price', 'discount_percent', 'category_id', 'affiliate_link', 'availability', 'is_featured', 'is_deal', 'is_verified', 'rating', 'rating_count', 'specifications', 'images', 'seo_title', 'seo_description'];
  const out = Object.fromEntries(columns.filter((c) => view[c] !== undefined).map((c) => [c, view[c]]));
  out.price = Number(out.price) || 0;
  out.discount_percent = Number(out.discount_percent) || 0;
  return out;
}

const descriptionFormat = (product) => (product.draft && product.draft.description !== undefined ? 'html' : product.description_format);

async function write(id, fields) {
  const { data, error } = await supabaseAdmin.from('products').update(fields).eq('id', id).select(SELECT).single();
  if (error) throw new Error(`Failed to save product: ${error.message}`);
  return data;
}

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(Math.max(1, Number(req.query.perPage) || 50), 100);
  const result = await Product.list({
    q: typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '',
    status: STATUSES.includes(req.query.status) ? req.query.status : undefined,
    includeAll: true,
    sort: 'newest',
    page,
    perPage
  });
  res.json({
    success: true,
    ...result,
    items: result.items.map((p) => ({ ...publicProduct(p), has_draft: !!p.draft, draft: undefined, name: (p.draft && p.draft.name) || p.name })),
    counts: await Product.statusCounts()
  });
});

exports.get = asyncHandler(async (req, res) => {
  const product = await load(req.params.id);
  res.json({
    success: true,
    product: { ...merged(product), has_draft: !!product.draft, status: product.status, publish_at: product.publish_at, draft_saved_at: product.draft_saved_at, slug: product.slug, category_name: product.category_name, images_missing: !usableImages(merged(product).images).length },
    // The version visitors see, for comparing against the draft
    live: { description: product.description, description_format: product.description_format, name: product.name }
  });
});

// How the current draft will look on the product page
exports.preview = asyncHandler(async (req, res) => {
  const product = await load(req.params.id);
  const view = shape(product);
  let category = { name: product.category_name, slug: product.category_slug };
  if (view.category_id !== product.category_id) {
    const { data } = await supabaseAdmin.from('categories').select('name, slug').eq('id', view.category_id).maybeSingle();
    category = data ? { name: data.name, slug: data.slug } : { name: null, slug: null };
  }
  const price = Number(view.price) || 0;
  res.json({
    success: true,
    product: {
      ...view,
      description_format: descriptionFormat(product),
      category_name: category.name,
      category_slug: category.slug,
      final_price: +(price * (1 - (Number(view.discount_percent) || 0) / 100)).toFixed(2)
    },
    related: [],
    preview: true
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { fields, errors } = await readFields(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ success: false, errors: Object.values(errors), fieldErrors: errors });
  const name = (fields.name || '').trim() || `Untitled product ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const { data, error } = await supabaseAdmin.from('products').insert({
    ...fields,
    name,
    slug: slugify(`${name}-${Date.now()}`, { lower: true, strict: true }),
    price: fields.price || 0,
    discount_percent: fields.discount_percent || 0,
    affiliate_link: fields.affiliate_link || '',
    description_format: 'html',
    status: 'draft'
  }).select(SELECT).single();
  if (error) throw new Error(`Failed to create product: ${error.message}`);
  res.status(201).json({ success: true, id: data.id, status: 'draft' });
});

// Autosave. Never touches what visitors see.
exports.saveDraft = asyncHandler(async (req, res) => {
  const product = await load(req.params.id);
  const { fields, errors } = await readFields(req.body || {}, product);
  if (Object.keys(errors).length) return res.status(400).json({ success: false, errors: Object.values(errors), fieldErrors: errors });
  const savedAt = new Date().toISOString();
  await write(product.id, { draft: { ...(product.draft || {}), ...fields }, draft_saved_at: savedAt });
  res.json({ success: true, draft_saved_at: savedAt });
});

exports.discardDraft = asyncHandler(async (req, res) => {
  const product = await load(req.params.id);
  await write(product.id, { draft: null, draft_saved_at: null });
  res.json({ success: true, message: 'Draft changes discarded.' });
});

async function applyMerged(product, extra) {
  const updated = await write(product.id, {
    ...liveColumns(merged(product)),
    description_format: descriptionFormat(product),
    draft: null,
    draft_saved_at: null,
    ...extra
  });
  invalidateHomeCache();
  return updated;
}

function assertPublishable(product) {
  const errors = publishErrors(merged(product));
  if (Object.keys(errors).length) {
    throw clientError('This product isn’t ready to publish yet.', 422, { fieldErrors: errors });
  }
}

exports.publish = asyncHandler(async (req, res) => {
  const product = await load(req.params.id);
  assertPublishable(product);
  // A product started without a title gets a proper address the first time it goes live
  const name = merged(product).name;
  const slug = /^untitled-product/.test(product.slug) ? slugify(`${name}-${Date.now()}`, { lower: true, strict: true }) : product.slug;
  const updated = await applyMerged(product, { status: 'published', publish_at: null, slug });
  await audit(req, 'product.publish', { type: 'product', id: product.id, details: { name: updated.name } });
  notifyPartners('product.updated', updated);
  res.json({ success: true, message: 'Published.', status: 'published', slug: updated.slug });
});

exports.setStatus = asyncHandler(async (req, res) => {
  const { status, publish_at: publishAt } = req.body;
  const product = await load(req.params.id);
  if (status === 'pending_review') {
    // Anyone who can edit may ask for review; a live product stays live until approved
    if (product.status === 'published') throw clientError('This product is live. Use "Publish changes", or take it off the site first.', 409);
    await write(product.id, { status });
  } else if (!req.permissions.includes('products.publish')) {
    throw clientError("Your role doesn't allow this.", 403);
  } else if (status === 'draft' || status === 'archived') {
    await write(product.id, { status, publish_at: null });
    invalidateHomeCache();
    if (product.status === 'published') notifyPartners('product.deleted', product);
  } else if (status === 'scheduled') {
    const when = new Date(publishAt);
    if (Number.isNaN(when.getTime()) || when <= new Date()) throw clientError('Choose a date and time in the future.');
    assertPublishable(product);
    await applyMerged(product, { status, publish_at: when.toISOString() });
  } else {
    throw clientError('Choose a valid status.');
  }
  await audit(req, 'product.status', { type: 'product', id: product.id, details: { from: product.status, to: status } });
  res.json({ success: true, status, message: 'Status updated.' });
});

exports.remove = asyncHandler(async (req, res) => {
  const product = await load(req.params.id);
  await Product.remove(product.id);
  deleteImages(product.images).catch(() => {});
  invalidateHomeCache();
  await audit(req, 'product.delete', { type: 'product', id: product.id, details: { name: product.name } });
  notifyPartners('product.deleted', product);
  res.json({ success: true, message: 'Product deleted.' });
});

/** Publishes anything scheduled for now or earlier. Run on start-up and every minute. */
async function publishDue() {
  const { data, error } = await supabaseAdmin
    .from('products').update({ status: 'published', publish_at: null })
    .eq('status', 'scheduled').lte('publish_at', new Date().toISOString()).select('id, slug');
  if (error) {
    console.warn('[schedule] could not publish scheduled products:', error.message);
    return;
  }
  if (data && data.length) {
    invalidateHomeCache();
    data.forEach((p) => notifyPartners('product.updated', p));
    console.log(`[schedule] published ${data.length} scheduled product(s)`);
  }
}

exports.publishDue = publishDue;
exports.publishErrors = publishErrors;
