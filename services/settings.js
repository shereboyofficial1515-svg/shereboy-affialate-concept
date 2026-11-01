// services/settings.js
// Site settings: one validated JSON document per dashboard tab, stored in
// site_settings. The defaults reproduce the site as it was before this table
// existed, so an empty table changes nothing. Everything is read through a
// short cache, because every page view needs it.

const { supabaseAdmin } = require('../config/supabase');
const { BRAND_DEFAULT_SECTIONS } = require('./homeSections');

// ---------- Field types: each returns the clean value, or throws a message ----------
const fail = (message) => { throw new Error(message); };
const text = (max) => (v, label) => {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') fail(`${label} must be text.`);
  if (v.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return v.trim();
};
const bool = () => (v) => v === true || v === 'true';
const int = (min, max) => (v, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
};
const number = (min, max) => (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(`${label} must be a number from ${min} to ${max}.`);
  return n;
};
const oneOf = (...values) => (v, label) => (values.includes(v) ? v : fail(`${label} isn't a valid choice.`));
const color = () => (v, label) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fail(`${label} must be a colour like #0F766E.`));
const emailAddress = () => (v, label) => {
  const value = text(254)(v, label);
  return !value || /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(value) ? value : fail(`${label} isn't a valid email address.`);
};
// A web address or a path on this site. javascript: and friends are refused.
const link = () => (v, label) => {
  const value = text(2000)(v, label);
  if (!value || value.startsWith('/')) return value;
  try {
    if (/^https?:$/.test(new URL(value).protocol)) return value;
  } catch { /* falls through */ }
  return fail(`${label} must be a full web address (https://…).`);
};
const idList = (max) => (v, label) => {
  if (!Array.isArray(v) || v.length > max || !v.every((x) => Number.isInteger(x) && x > 0)) fail(`${label} isn't valid.`);
  return v;
};
const sections = () => (v, label) => {
  if (!Array.isArray(v)) fail(`${label} isn't valid.`);
  const known = new Set(BRAND_DEFAULT_SECTIONS.map((s) => s.key));
  const seen = new Set();
  const clean = v.filter((s) => s && known.has(s.key) && !seen.has(s.key) && seen.add(s.key)).map((s) => ({ key: s.key, enabled: s.enabled !== false }));
  // A section that wasn't sent is kept at the end, so none can vanish for good
  BRAND_DEFAULT_SECTIONS.forEach((s) => { if (!seen.has(s.key)) clean.push({ key: s.key, enabled: s.enabled }); });
  return clean;
};
const timezone = () => (v, label) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return v;
  } catch {
    return fail(`${label} isn't a known time zone.`);
  }
};
const currencyCode = () => (v, label) => {
  if (!/^[A-Z]{3}$/.test(v || '')) fail(`${label} must be a three-letter code like NGN.`);
  return v;
};

// ---------- What each tab holds: [field, type, default] ----------
const SCHEMA = {
  identity: {
    site_name: [text(100), 'SHEREBOY AFFILIATE CONCEPT', 'Website name'],
    tagline: [text(160), 'Smart finds. Honest prices.', 'Tagline'],
    description: [text(500), 'Hand-picked products from online retailers, with honest prices and clear disclosure. A SHEREBOY TECH LTD project.', 'Description'],
    logo: [link(), '', 'Main logo'],
    logo_alt: [link(), '', 'Alternative logo'],
    favicon: [link(), '', 'Favicon'],
    email_logo: [link(), '', 'Email logo'],
    contact_email: [emailAddress(), '', 'Contact email'],
    support_email: [emailAddress(), '', 'Support email'],
    phone: [text(40), '2347055426419', 'Phone number'],
    address: [text(300), 'Warri/Sapele, Delta State, Nigeria', 'Address'],
    social_tiktok: [link(), 'https://tiktok.com/@shereboy', 'TikTok'],
    social_youtube: [link(), 'https://youtube.com/@shereboy1379', 'YouTube'],
    social_whatsapp: [link(), 'https://wa.me/2347055426419', 'WhatsApp'],
    social_facebook: [link(), '', 'Facebook'],
    social_instagram: [link(), '', 'Instagram'],
    social_x: [link(), '', 'X']
  },
  appearance: {
    primary: [color(), '#0F766E', 'Primary colour'],
    secondary: [color(), '#0B2A2F', 'Secondary colour'],
    accent: [color(), '#F5A524', 'Accent colour'],
    background: [color(), '#FFFFFF', 'Background colour'],
    text: [color(), '#0B2A2F', 'Text colour'],
    default_theme: [oneOf('light', 'dark', 'system'), 'light', 'Default theme'],
    allow_theme_toggle: [bool(), false, 'Theme switch'],
    font: [oneOf('jakarta', 'system', 'serif'), 'jakarta', 'Typeface'],
    base_font_size: [int(14, 20), 16, 'Text size'],
    button_style: [oneOf('rounded', 'pill', 'square'), 'rounded', 'Button style'],
    border_radius: [oneOf('small', 'medium', 'large'), 'medium', 'Corner radius'],
    container_width: [int(960, 1600), 1240, 'Page width'],
    product_columns: [oneOf('auto', '3', '4', '5'), 'auto', 'Product columns']
  },
  homepage: {
    hero_headline: [text(120), 'Smart finds.', 'Hero headline'],
    hero_highlight: [text(120), 'Honest prices.', 'Hero highlighted line'],
    hero_description: [text(400), 'Hand-picked products from online retailers, priced in naira, with a clear view of what you save before you click through.', 'Hero description'],
    hero_background: [link(), '', 'Hero background'],
    featured_product_ids: [idList(24), [], 'Featured products'],
    sections: [sections(), BRAND_DEFAULT_SECTIONS, 'Sections'],
    promo_enabled: [bool(), false, 'Promotional bar'],
    promo_message: [text(200), '', 'Promotional message'],
    promo_link: [link(), '', 'Promotional link']
  },
  seo: {
    meta_title: [text(120), 'SHEREBOY AFFILIATE CONCEPT — Smart finds. Honest prices.', 'Meta title'],
    meta_description: [text(320), 'Hand-picked affiliate deals across electronics, home and phone accessories, priced in naira, with an AI shopping assistant to help you choose.', 'Meta description'],
    og_image: [link(), '', 'Default SEO image'],
    google_verification: [text(200), '', 'Google verification code'],
    allow_indexing: [bool(), true, 'Search engine indexing'],
    robots_extra: [text(2000), '', 'Extra robots rules'],
    canonical_base: [link(), '', 'Canonical URL'],
    twitter_handle: [text(50), '', 'X handle'],
    sitemap_products: [bool(), true, 'Products in sitemap'],
    sitemap_categories: [bool(), true, 'Categories in sitemap'],
    sitemap_pages: [bool(), true, 'Pages in sitemap']
  },
  email: {
    sender_name: [text(100), '', 'Sender name'],
    sender_email: [emailAddress(), '', 'Sender email'],
    reply_to: [emailAddress(), '', 'Reply-to address'],
    newsletter_enabled: [bool(), true, 'Newsletter signup'],
    welcome_enabled: [bool(), true, 'Welcome email'],
    announcement_default_products: [int(1, 12), 6, 'Products in a weekly draft'],
    notify_email: [emailAddress(), '', 'Notification address'],
    notify_new_subscriber: [bool(), false, 'New subscriber notification'],
    notify_contact_message: [bool(), false, 'Contact message notification']
  },
  regional: {
    country: [text(60), 'Nigeria', 'Country'],
    locale: [oneOf('en-NG', 'en-GB', 'en-US', 'fr-FR', 'en-GH', 'en-KE', 'en-ZA'), 'en-NG', 'Language and number format'],
    currency: [currencyCode(), 'NGN', 'Currency'],
    timezone: [timezone(), 'Africa/Lagos', 'Time zone'],
    date_format: [oneOf('medium', 'long', 'numeric'), 'medium', 'Date format'],
    time_format: [oneOf('12h', '24h'), '12h', 'Time format']
  },
  ai: {
    provider: [oneOf('gemini', 'anthropic', 'openai'), 'gemini', 'AI provider'],
    model: [text(100), process.env.GEMINI_MODEL || 'gemini-3.6-flash', 'Model'],
    max_output_tokens: [int(50, 16000), 4000, 'Maximum output length'],
    temperature: [number(0, 1), 0.4, 'Creativity'],
    monthly_request_limit: [int(0, 10000000), 2000, 'Monthly request limit'],
    monthly_token_limit: [int(0, 2000000000), 2000000, 'Monthly token limit'],
    price_input_per_million: [number(0, 1000), 0, 'Price per million input tokens'],
    price_output_per_million: [number(0, 1000), 0, 'Price per million output tokens'],
    capability_description: [bool(), true, 'Description generator'],
    capability_title: [bool(), true, 'Title generator'],
    capability_seo: [bool(), true, 'SEO generator'],
    capability_categorize: [bool(), true, 'Categorization'],
    capability_marketing: [bool(), true, 'Marketing copy'],
    capability_email: [bool(), true, 'Email content'],
    capability_summary: [bool(), true, 'Summary generator'],
    capability_grammar: [bool(), true, 'Grammar correction'],
    capability_rewrite: [bool(), true, 'Rewriting and proofreading'],
    capability_assistant: [bool(), true, 'Shopping assistant']
  }
};

const GROUPS = Object.keys(SCHEMA);

function defaultsFor(group) {
  return Object.fromEntries(Object.entries(SCHEMA[group]).map(([field, [, value]]) => [field, value]));
}

const CACHE_MS = 30 * 1000;
let cache = null;
let cacheExpires = 0;
let version = Date.now();

function merge(rows) {
  const all = {};
  GROUPS.forEach((group) => {
    const stored = (rows.find((r) => r.key === group) || {}).value || {};
    all[group] = { ...defaultsFor(group), ...stored };
  });
  return all;
}

async function loadAll() {
  if (cache && Date.now() < cacheExpires) return cache;
  const { data, error } = await supabaseAdmin.from('site_settings').select('key, value');
  if (error) {
    // Unreachable database or migration not run: keep the site up on what we know
    if (!cache) console.warn('[settings] using defaults:', error.message);
    cache = cache || merge([]);
    cacheExpires = Date.now() + 5000;
    return cache;
  }
  cache = merge(data || []);
  cacheExpires = Date.now() + CACHE_MS;
  return cache;
}

/** Latest known settings without waiting (for code that can't be async). */
function cached() {
  return cache || merge([]);
}

/** Forces a re-read. The last known values stay readable until it completes. */
function invalidate() {
  cacheExpires = 0;
  version = Date.now();
}

/** Bumped on every change: page URLs include it so browsers fetch the new theme. */
const currentVersion = () => version;

/** Validates a tab. Returns { value, errors }; unknown fields are ignored. */
function validate(group, input, current) {
  const value = { ...current };
  const errors = [];
  Object.entries(SCHEMA[group]).forEach(([field, [type, , label]]) => {
    if (input[field] === undefined) return;
    try {
      value[field] = type(input[field], label);
    } catch (err) {
      errors.push(err.message);
    }
  });
  return { value, errors };
}

async function save(group, input, actorEmail) {
  const all = await loadAll();
  const { value, errors } = validate(group, input, all[group]);
  if (errors.length) return { errors };
  const row = { key: group, value, updated_by: actorEmail, updated_at: new Date().toISOString() };
  const { error: updateError, data: updated } = await supabaseAdmin.from('site_settings').update(row).eq('key', group).select('key');
  if (updateError) throw new Error(`Failed to save settings: ${updateError.message}`);
  if (!updated || !updated.length) {
    const { error } = await supabaseAdmin.from('site_settings').insert(row);
    if (error) throw new Error(`Failed to save settings: ${error.message}`);
  }
  invalidate();
  await loadAll();
  return { value };
}

/** A price in the currency chosen in Regional Settings. */
function formatMoney(value) {
  const { locale, currency } = cached().regional;
  const amount = Number(value);
  try {
    if (currency === 'NGN') return `₦${amount.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
    return amount.toLocaleString(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** A date in the format and time zone chosen in Regional Settings. */
function formatDate(value) {
  const { locale, timezone, date_format: format } = cached().regional;
  const options = format === 'numeric' ? { year: 'numeric', month: '2-digit', day: '2-digit' }
    : { year: 'numeric', month: format === 'long' ? 'long' : 'short', day: 'numeric' };
  return new Date(value).toLocaleDateString(locale, { ...options, timeZone: timezone });
}

const siteUrl = (all = cached()) => (all.seo.canonical_base || process.env.PUBLIC_SITE_URL || 'https://shereboyaffiliateconcept.shop').replace(/\/+$/, '');

module.exports = { GROUPS, SCHEMA, loadAll, cached, invalidate, currentVersion, validate, save, defaultsFor, siteUrl, formatMoney, formatDate };
