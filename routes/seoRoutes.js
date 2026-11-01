// routes/seoRoutes.js
// Search engines and link previews (WhatsApp, Facebook, X) don't reliably run
// JavaScript, so a product's title, image and structured data are written into
// the page on the server. Also serves the sitemap.

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { publicProduct } = require('../services/productView');
const settings = require('../services/settings');
const { applySettings, template } = require('../services/siteRenderer');
const { toPlainText } = require('../services/richText');

const router = express.Router();
const STATIC_PAGES = ['/', '/products.html', '/categories.html', '/about.html', '/faq.html', '/contact.html', '/privacy.html', '/terms.html'];
const AVAILABILITY = { in_stock: 'InStock', limited: 'LimitedAvailability', out_of_stock: 'OutOfStock' };

const site = () => settings.siteUrl();

function attr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function absolute(url) {
  return /^https:/.test(url) ? url : `${site()}${url}`;
}

function summary(product) {
  if (product.seo_description) return product.seo_description;
  const text = toPlainText(product.short_description || product.description);
  if (!text) return `${String(product.name).trim()}, on ${settings.cached().identity.site_name}.`;
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, '')}…` : text;
}

function structuredData(product, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: String(product.name).trim(),
    description: summary(product),
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: settings.cached().regional.currency,
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

function replaceMeta(html, id, value) {
  return html.replace(new RegExp(`(<meta id="${id}"[^>]*content=")[^"]*(")`), (_, open, close) => `${open}${attr(value)}${close}`);
}

router.get('/product-details.html', asyncHandler(async (req, res, next) => {
  const all = await settings.loadAll();
  const slug = req.query.slug;
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,200}$/.test(slug)) return next(); // the page shows its own message

  let product;
  try {
    product = await Product.findBySlug(slug);
  } catch (err) {
    console.error('[seo] product lookup failed:', err.message);
    return next(); // serve the plain page: the browser will try again itself
  }
  if (!product || product.status !== 'published') {
    res.status(404);
    res.set('X-Robots-Tag', 'noindex');
    return next();
  }

  product = publicProduct(product);
  const url = `${site()}/product-details.html?slug=${encodeURIComponent(product.slug)}`;
  const title = `${product.seo_title || String(product.name).trim()} — ${all.identity.site_name}`;
  const description = summary(product);
  // The JPEG copy, because not every link-preview service displays WebP
  const previewImage = (url) => (/\/opt-[^/]+\.webp$/.test(url) ? url.replace(/\.webp$/, '-w480.jpg') : url);
  const image = product.images.length ? absolute(previewImage(product.images[0])) : `${site()}/images/brand/og-default.png`;

  let html = applySettings(template('product-details.html'), all).replace(/<title[^>]*>[^<]*<\/title>/, () => `<title id="pageTitle">${attr(title)}</title>`);
  html = replaceMeta(html, 'pageDescription', description);
  html = replaceMeta(html, 'ogTitle', title);
  html = replaceMeta(html, 'ogDescription', description);
  html = replaceMeta(html, 'ogUrl', url);
  html = replaceMeta(html, 'ogImage', image);
  html = replaceMeta(html, 'twitterImage', image);
  html = html.replace('<!-- structured-data -->',
    () => `<link rel="canonical" href="${attr(url)}" />\n  <script type="application/ld+json">${structuredData(product, url)}</script>`);

  res.set('Cache-Control', 'public, max-age=60');
  res.type('html').send(html);
}));

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const { seo } = await settings.loadAll();
  const { data, error } = await supabaseAdmin.from('products').select('slug, date_added, updated_at').eq('status', 'published').order('date_added', { ascending: false }).limit(5000);
  if (error) throw new Error(`Failed to build sitemap: ${error.message}`);
  const { data: cats, error: catError } = await supabaseAdmin.from('categories').select('slug');
  const { data: pages } = await supabaseAdmin.from('pages').select('slug, published_html, published_at');
  if (catError) throw new Error(`Failed to build sitemap: ${catError.message}`);

  const entry = (loc, lastmod) => `<url><loc>${attr(loc)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}</url>`;
  const urls = [
    entry(`${site()}/`),
    ...(seo.sitemap_pages ? STATIC_PAGES.filter((p) => p !== '/').map((p) => entry(`${site()}${p}`)) : []),
    ...(seo.sitemap_pages ? (pages || []).filter((p) => p.published_html && !STATIC_PAGES.includes(`/${p.slug}.html`)).map((p) => entry(`${site()}/${p.slug}.html`, p.published_at)) : []),
    ...(seo.sitemap_categories ? (cats || []).map((c) => entry(`${site()}/products.html?category=${encodeURIComponent(c.slug)}`)) : []),
    ...(seo.sitemap_products ? (data || []).map((p) => entry(`${site()}/product-details.html?slug=${encodeURIComponent(p.slug)}`, p.updated_at || p.date_added)) : [])
  ];
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`);
}));

module.exports = router;
