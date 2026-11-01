// routes/seoRoutes.js
// Search engines and link previews (WhatsApp, Facebook, X) don't reliably run
// JavaScript, so a product's title, image and structured data are written into
// the page on the server. Also serves the sitemap.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { publicProduct } = require('../services/productView');

const router = express.Router();
const TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'product-details.html');
const STATIC_PAGES = ['/', '/products.html', '/categories.html', '/about.html', '/faq.html', '/contact.html', '/privacy.html', '/terms.html'];
const AVAILABILITY = { in_stock: 'InStock', limited: 'LimitedAvailability', out_of_stock: 'OutOfStock' };

const site = () => (process.env.PUBLIC_SITE_URL || 'https://shereboyaffiliateconcept.shop').replace(/\/+$/, '');

function attr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function absolute(url) {
  return /^https:/.test(url) ? url : `${site()}${url}`;
}

function summary(product) {
  const text = String(product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return `${product.name}, on SHEREBOY AFFILIATE CONCEPT.`;
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, '')}…` : text;
}

function structuredData(product, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: summary(product),
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'NGN',
      price: product.final_price,
      availability: `https://schema.org/${AVAILABILITY[product.availability] || 'InStock'}`
    }
  };
  if (product.images.length) data.image = product.images.map(absolute);
  if (product.category_name) data.category = product.category_name;
  // Only published when real rating data has been entered, never made up
  if (product.rating > 0 && product.rating_count > 0) {
    data.aggregateRating = { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: product.rating_count };
  }
  // "<" can't appear in the JSON, so a product name can't close the script block
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

let template;
function loadTemplate() {
  // Re-read outside production so edits show up without a restart
  if (!template || process.env.NODE_ENV !== 'production') template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return template;
}

function replaceMeta(html, id, value) {
  return html.replace(new RegExp(`(<meta id="${id}"[^>]*content=")[^"]*(")`), `$1${attr(value)}$2`);
}

router.get('/product-details.html', asyncHandler(async (req, res, next) => {
  const slug = req.query.slug;
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,200}$/.test(slug)) return next(); // the page shows its own message

  let product;
  try {
    product = await Product.findBySlug(slug);
  } catch (err) {
    console.error('[seo] product lookup failed:', err.message);
    return next(); // serve the plain page: the browser will try again itself
  }
  if (!product) {
    res.status(404);
    res.set('X-Robots-Tag', 'noindex');
    return next();
  }

  product = publicProduct(product);
  const url = `${site()}/product-details.html?slug=${encodeURIComponent(product.slug)}`;
  const title = `${product.name} — SHEREBOY AFFILIATE CONCEPT`;
  const description = summary(product);
  const image = product.images.length ? absolute(product.images[0]) : `${site()}/images/brand/og-default.png`;

  let html = loadTemplate().replace(/<title[^>]*>[^<]*<\/title>/, `<title id="pageTitle">${attr(title)}</title>`);
  html = replaceMeta(html, 'pageDescription', description);
  html = replaceMeta(html, 'ogTitle', title);
  html = replaceMeta(html, 'ogDescription', description);
  html = replaceMeta(html, 'ogUrl', url);
  html = replaceMeta(html, 'ogImage', image);
  html = replaceMeta(html, 'twitterImage', image);
  html = html.replace('<!-- structured-data -->',
    `<link rel="canonical" href="${attr(url)}" />\n  <script type="application/ld+json">${structuredData(product, url)}</script>`);

  res.set('Cache-Control', 'public, max-age=60');
  res.type('html').send(html);
}));

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('products').select('slug, date_added, updated_at').order('date_added', { ascending: false }).limit(5000);
  if (error) throw new Error(`Failed to build sitemap: ${error.message}`);
  const { data: cats, error: catError } = await supabaseAdmin.from('categories').select('slug');
  if (catError) throw new Error(`Failed to build sitemap: ${catError.message}`);

  const entry = (loc, lastmod) => `<url><loc>${attr(loc)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}</url>`;
  const urls = [
    ...STATIC_PAGES.map((p) => entry(`${site()}${p}`)),
    ...(cats || []).map((c) => entry(`${site()}/products.html?category=${encodeURIComponent(c.slug)}`)),
    ...(data || []).map((p) => entry(`${site()}/product-details.html?slug=${encodeURIComponent(p.slug)}`, p.updated_at || p.date_added))
  ];
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`);
}));

module.exports = router;
