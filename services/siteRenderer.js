// services/siteRenderer.js
// Applies dashboard settings to the site on the server, so names, colours,
// logos and meta tags are right in the first response: no flash of the old
// branding, and search engines and link previews see them without running scripts.

const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const { supabaseAdmin } = require('../config/supabase');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_NAME = 'SHEREBOY AFFILIATE CONCEPT';
const DEFAULT_SITE = 'https://shereboyaffiliateconcept.shop';
const LEGAL_PAGES = {
  privacy: { title: 'Privacy Policy', file: 'privacy.html' },
  terms: { title: 'Terms & Conditions', file: 'terms.html' },
  'affiliate-disclosure': { title: 'Affiliate Disclosure' },
  'cookie-policy': { title: 'Cookie Policy' },
  returns: { title: 'Refunds & Returns' }
};

const attr = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const templates = new Map();
function template(file) {
  if (!templates.has(file) || process.env.NODE_ENV !== 'production') {
    templates.set(file, fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'));
  }
  return templates.get(file);
}

function setMeta(html, matcher, value) {
  return html.replace(new RegExp(`(<meta[^>]*${matcher}[^>]*content=")[^"]*(")`), (_, a, b) => `${a}${attr(value)}${b}`);
}

/** Absolute URL for a setting that may be a path on this site. */
const absolute = (url, site) => (/^https?:/.test(url) ? url : `${site}${url}`);

function applySettings(html, all, { isHome = false } = {}) {
  const { identity, seo, regional, appearance } = all;
  const site = settings.siteUrl(all);
  let out = html;

  if (identity.site_name !== DEFAULT_NAME) out = out.split(DEFAULT_NAME).join(attr(identity.site_name));
  if (site !== DEFAULT_SITE) out = out.split(DEFAULT_SITE).join(attr(site));
  out = out.replace('<html lang="en">', `<html lang="${attr(regional.locale.split('-')[0])}">`);

  if (isHome) {
    // The default title contains the default name, so it follows a renamed site
    const metaTitle = seo.meta_title.split(DEFAULT_NAME).join(identity.site_name);
    out = out.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${attr(metaTitle)}</title>`);
    out = setMeta(out, 'name="description"', seo.meta_description);
    out = setMeta(out, 'property="og:title"', metaTitle);
    out = setMeta(out, 'property="og:description"', seo.meta_description);
  }
  if (seo.og_image) {
    const image = absolute(seo.og_image, site);
    out = out.split(`${site}/images/brand/og-default.png`).join(attr(image));
  }
  if (identity.favicon) {
    out = out.replace(/\s*<link rel="icon" href="\/favicon\.ico"[^>]*>/, '')
      .replace(/<link rel="icon" href="\/images\/favicon\.svg"[^>]*>/, `<link rel="icon" href="${attr(identity.favicon)}" />`)
      .replace(/<link rel="apple-touch-icon" href="[^"]*"/, `<link rel="apple-touch-icon" href="${attr(identity.favicon)}"`);
  }
  out = out.replace(/<meta name="theme-color" content="[^"]*"/, `<meta name="theme-color" content="${attr(appearance.secondary)}"`);

  const version = settings.currentVersion();
  const head = [`<link rel="stylesheet" href="/theme.css?v=${version}" />`, `<script src="/site-config.js?v=${version}"></script>`];
  if (seo.google_verification) head.push(`<meta name="google-site-verification" content="${attr(seo.google_verification)}" />`);
  if (!seo.allow_indexing) head.push('<meta name="robots" content="noindex, nofollow" />');
  if (seo.twitter_handle) head.push(`<meta name="twitter:site" content="${attr(seo.twitter_handle)}" />`);
  return out.replace('</head>', `  ${head.join('\n  ')}\n</head>`);
}

function applyHero(html, { homepage }) {
  const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const heading = `${escapeText(homepage.hero_headline)}${homepage.hero_highlight ? `<br /><em>${escapeText(homepage.hero_highlight)}</em>` : ''}`;
  return html
    .replace(/(<h1 id="heroTitle">)[\s\S]*?(<\/h1>)/, `$1${heading}$2`)
    .replace(/(<p class="lead" id="heroLead">)[\s\S]*?(<\/p>)/, `$1${escapeText(homepage.hero_description)}$2`);
}

async function publishedPage(slug) {
  const { data, error } = await supabaseAdmin.from('pages').select('title, published_html, published_at').eq('slug', slug).maybeSingle();
  if (error || !data || !data.published_html) return null;
  return data;
}

function legalHtml(all, title, bodyHtml, updatedAt) {
  const updated = updatedAt ? `<p class="page-updated">Last updated ${new Date(updatedAt).toLocaleDateString(all.regional.locale, { timeZone: all.regional.timezone, dateStyle: 'long' })}</p>` : '';
  const html = template('legal.html')
    .replace(/<!-- page-title -->/g, attr(title))
    .replace('<!-- page-updated -->', updated)
    .replace('<!-- page-content -->', () => bodyHtml);
  return applySettings(html, all);
}

/** Express handler for public HTML pages. Falls through if there is no such page. */
async function serveHtml(req, res, next) {
  try {
    const name = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
    if (!/^[a-z0-9-]+\.html$/.test(name)) return next();
    const all = await settings.loadAll();
    res.set('Cache-Control', 'no-cache');

    const slug = name.replace(/\.html$/, '');
    if (LEGAL_PAGES[slug]) {
      const page = await publishedPage(slug);
      if (page) return res.type('html').send(legalHtml(all, page.title, page.published_html, page.published_at));
    }
    // legal.html is only a template; no-static pages stay 404 until published
    if (name === 'legal.html' || !fs.existsSync(path.join(PUBLIC_DIR, name))) return next();

    let html = applySettings(template(name), all, { isHome: name === 'index.html' });
    if (name === 'index.html') html = applyHero(html, all);
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
}

module.exports = { serveHtml, applySettings, legalHtml, template, LEGAL_PAGES, PUBLIC_DIR, attr };
