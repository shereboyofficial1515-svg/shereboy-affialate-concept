// controllers/siteAdminController.js
// Dashboard API for settings, pages, banners, accounts, the audit log, analytics
// and system health. Also serves the public theme and configuration files.

const fs = require('fs');
const path = require('path');
const validator = require('validator');
const { supabaseAdmin } = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const settings = require('../services/settings');
const { BRAND_DEFAULT_SECTIONS } = require('../services/homeSections');
const { themeCss } = require('../services/themeCss');
const { cleanHtml } = require('../services/richText');
const { audit } = require('../services/audit');
const renderer = require('../services/siteRenderer');
const { isConfigured } = require('../services/email/client');
const providers = require('../services/ai/providers');
const { BUCKET } = require('../services/imageStorage');
const { ROLE_PERMISSIONS } = require('../middleware/auth');
const { invalidateHomeCache } = require('./homeController');

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}
const throwIf = (error, what) => { if (error) throw new Error(`Failed to ${what}: ${error.message}`); };

// ---------- Public: what the browser needs to apply the settings ----------
function publicConfig(all, legalLinks) {
  const { identity, appearance, homepage, regional, email } = all;
  return {
    name: identity.site_name,
    tagline: identity.tagline,
    description: identity.description,
    logo: identity.logo,
    logoAlt: identity.logo_alt,
    contactEmail: identity.contact_email,
    supportEmail: identity.support_email,
    phone: identity.phone,
    address: identity.address,
    social: { tiktok: identity.social_tiktok, youtube: identity.social_youtube, whatsapp: identity.social_whatsapp, facebook: identity.social_facebook, instagram: identity.social_instagram, x: identity.social_x },
    theme: { default: appearance.default_theme, allowToggle: appearance.allow_theme_toggle },
    regional: { locale: regional.locale, currency: regional.currency, timezone: regional.timezone, dateFormat: regional.date_format, timeFormat: regional.time_format },
    promo: homepage.promo_enabled && homepage.promo_message ? { message: homepage.promo_message, link: homepage.promo_link } : null,
    newsletterEnabled: email.newsletter_enabled,
    legalLinks
  };
}

async function publishedLegalLinks() {
  const { data, error } = await supabaseAdmin.from('pages').select('slug, title, published_html');
  const published = new Map(!error ? (data || []).filter((p) => p.published_html).map((p) => [p.slug, p.title]) : []);
  return Object.entries(renderer.LEGAL_PAGES)
    .filter(([slug, page]) => published.has(slug) || page.file)
    .map(([slug, page]) => ({ href: `/${slug}.html`, title: published.get(slug) || page.title }));
}

// Runs before anything paints: applies the theme early, so there's no light flash
exports.siteConfigJs = asyncHandler(async (req, res) => {
  const all = await settings.loadAll();
  const config = publicConfig(all, await publishedLegalLinks());
  const js = `window.SITE=${JSON.stringify(config).replace(/</g, '\\u003c')};
(function(){var d=window.SITE.theme.default,s=null;
if(window.SITE.theme.allowToggle){try{s=localStorage.getItem('theme')}catch(e){}}
var t=s||d;if(t==='system'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',t)})();`;
  res.set('Cache-Control', req.query.v ? 'public, max-age=86400' : 'no-cache');
  res.type('application/javascript').send(js);
});

exports.themeCssFile = asyncHandler(async (req, res) => {
  const all = await settings.loadAll();
  res.set('Cache-Control', req.query.v ? 'public, max-age=86400' : 'no-cache');
  res.type('text/css').send(themeCss(all.appearance, all.homepage));
});

exports.manifest = asyncHandler(async (req, res) => {
  const { identity, appearance } = await settings.loadAll();
  const custom = identity.favicon ? [{ src: identity.favicon, sizes: 'any', type: 'image/webp' }] : null;
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify({
    name: identity.site_name,
    short_name: identity.site_name.split(' ')[0],
    description: identity.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: appearance.background,
    theme_color: appearance.secondary,
    icons: custom || [
      { src: '/images/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/images/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/images/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }));
});

exports.robots = asyncHandler(async (req, res) => {
  const all = await settings.loadAll();
  const lines = ['User-agent: *'];
  if (all.seo.allow_indexing) {
    lines.push('Disallow: /admin/', 'Disallow: /api/', 'Disallow: /confirm-subscription.html', 'Disallow: /unsubscribe.html', 'Allow: /');
  } else {
    lines.push('Disallow: /');
  }
  if (all.seo.robots_extra) lines.push('', all.seo.robots_extra.replace(/\r/g, ''));
  lines.push('', `Sitemap: ${settings.siteUrl(all)}/sitemap.xml`);
  res.type('text/plain').send(`${lines.join('\n')}\n`);
});

// ---------- Settings tabs ----------
exports.getSettings = asyncHandler(async (req, res) => {
  const all = await settings.loadAll();
  const { ai, ...visible } = all;
  res.json({ success: true, settings: visible, sections: BRAND_DEFAULT_SECTIONS, email: { connected: isConfigured(), keySet: !!process.env.RESEND_API_KEY, webhookSet: !!process.env.RESEND_WEBHOOK_SECRET, envFrom: process.env.EMAIL_FROM || null } });
});

exports.saveSettings = asyncHandler(async (req, res) => {
  const { group } = req.params;
  if (!settings.GROUPS.includes(group) || group === 'ai') throw clientError('Unknown settings group.', 404);
  const { value, errors } = await settings.save(group, req.body, req.user.email);
  if (errors) return res.status(400).json({ success: false, errors });
  invalidateHomeCache();
  await audit(req, 'settings.update', { type: 'settings', id: group, details: { fields: Object.keys(req.body || {}).slice(0, 40) } });
  res.json({ success: true, message: 'Saved and applied to the website.', settings: value });
});

// The live preview: CSS for unsaved values, nothing stored
exports.previewTheme = asyncHandler(async (req, res) => {
  const all = await settings.loadAll();
  const { value, errors } = settings.validate('appearance', req.body, all.appearance);
  if (errors.length) return res.status(400).json({ success: false, errors });
  res.json({ success: true, css: themeCss(value, all.homepage), theme: value.default_theme });
});

// ---------- Legal pages: draft, preview, publish ----------
function staticContent(slug) {
  const page = renderer.LEGAL_PAGES[slug];
  if (!page || !page.file) return '';
  const html = fs.readFileSync(path.join(renderer.PUBLIC_DIR, page.file), 'utf8');
  const match = html.match(/<div class="container prose"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/);
  return match ? cleanHtml(match[1]) : '';
}

function assertSlug(slug) {
  if (!renderer.LEGAL_PAGES[slug]) throw clientError('Page not found.', 404);
}

exports.listPages = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('pages').select('*');
  throwIf(error, 'list pages');
  const rows = new Map((data || []).map((p) => [p.slug, p]));
  res.json({
    success: true,
    pages: Object.entries(renderer.LEGAL_PAGES).map(([slug, def]) => {
      const row = rows.get(slug);
      const draft = row ? row.draft_html : staticContent(slug);
      return {
        slug,
        title: row ? row.title : def.title,
        draft_html: draft,
        published: !!(row && row.published_html) || !!def.file,
        has_unpublished_changes: row ? row.draft_html !== row.published_html : false,
        published_at: row ? row.published_at : null,
        updated_at: row ? row.updated_at : null,
        url: `/${slug}.html`
      };
    })
  });
});

exports.savePage = asyncHandler(async (req, res) => {
  assertSlug(req.params.slug);
  const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 150) : '';
  if (!title) throw clientError('A page needs a title.');
  if (typeof req.body.draft_html !== 'string' || req.body.draft_html.length > 500000) throw clientError('The page is too long.');
  const row = { title, draft_html: cleanHtml(req.body.draft_html), updated_by: req.user.email, updated_at: new Date().toISOString() };
  const { data } = await supabaseAdmin.from('pages').update(row).eq('slug', req.params.slug).select('slug');
  if (!data || !data.length) {
    const { error } = await supabaseAdmin.from('pages').insert({ slug: req.params.slug, ...row });
    throwIf(error, 'save page');
  }
  res.json({ success: true, message: 'Draft saved. Visitors still see the published version.' });
});

exports.publishPage = asyncHandler(async (req, res) => {
  assertSlug(req.params.slug);
  const { data: page, error } = await supabaseAdmin.from('pages').select('*').eq('slug', req.params.slug).maybeSingle();
  throwIf(error, 'load page');
  if (!page) throw clientError('Save a draft first.', 409);
  if (!page.draft_html.replace(/<[^>]+>/g, '').trim()) throw clientError("An empty page can't be published.", 422);
  const { error: updateError } = await supabaseAdmin.from('pages')
    .update({ published_html: page.draft_html, published_at: new Date().toISOString(), updated_by: req.user.email }).eq('slug', page.slug);
  throwIf(updateError, 'publish page');
  settings.invalidate(); // the footer's links may have changed
  await audit(req, 'page.publish', { type: 'page', id: page.slug });
  res.json({ success: true, message: 'Published.' });
});

// Full-page preview of the draft (admins only, never indexed)
exports.previewPage = asyncHandler(async (req, res) => {
  assertSlug(req.params.slug);
  const all = await settings.loadAll();
  const { data: page } = await supabaseAdmin.from('pages').select('*').eq('slug', req.params.slug).maybeSingle();
  const def = renderer.LEGAL_PAGES[req.params.slug];
  const html = renderer.legalHtml(all, page ? page.title : def.title, page ? page.draft_html : staticContent(req.params.slug), null);
  res.set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-store');
  res.type('html').send(html);
});

// ---------- Banners ----------
function readBanner(body) {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 150) : '';
  if (!title) throw clientError('A banner needs a title.');
  const url = (value, label) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string' && (value.startsWith('/') || validator.isURL(value, { require_protocol: true, protocols: ['https', 'http'] }))) return value;
    throw clientError(`${label} must be a full web address.`);
  };
  const date = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw clientError('Enter a valid date.');
    return d.toISOString();
  };
  if (!['home_top', 'home_middle', 'home_bottom'].includes(body.placement)) throw clientError('Choose a placement.');
  return {
    title,
    message: typeof body.message === 'string' ? body.message.trim().slice(0, 400) : null,
    image_url: url(body.image_url, 'Image'),
    link_url: url(body.link_url, 'Link'),
    placement: body.placement,
    is_active: body.is_active !== false,
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
    starts_at: date(body.starts_at),
    ends_at: date(body.ends_at)
  };
}

exports.listBanners = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('banners').select('*').order('placement').order('sort_order').order('id');
  throwIf(error, 'list banners');
  res.json({ success: true, banners: data || [] });
});

exports.createBanner = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('banners').insert(readBanner(req.body)).select('*').single();
  throwIf(error, 'save banner');
  invalidateHomeCache();
  res.status(201).json({ success: true, banner: data });
});

exports.updateBanner = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('banners').update({ ...readBanner(req.body), updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').maybeSingle();
  throwIf(error, 'save banner');
  if (!data) throw clientError('Banner not found.', 404);
  invalidateHomeCache();
  res.json({ success: true, banner: data });
});

exports.deleteBanner = asyncHandler(async (req, res) => {
  const { error } = await supabaseAdmin.from('banners').delete().eq('id', req.params.id);
  throwIf(error, 'delete banner');
  invalidateHomeCache();
  res.json({ success: true });
});

// ---------- Accounts and roles ----------
exports.listUsers = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('admin_roles').select('*').order('email');
  throwIf(error, 'list accounts');
  const owners = `${process.env.ADMIN_EMAILS || ''},${process.env.ADMIN_EMAIL || ''}`.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  res.json({
    success: true,
    owners: [...new Set(owners)],
    users: data || [],
    permissions: ROLE_PERMISSIONS
  });
});

exports.saveUser = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!validator.isEmail(email)) throw clientError('Enter a valid email address.');
  if (!['admin', 'editor'].includes(req.body.role)) throw clientError('Choose a role.');
  if (email === req.user.email.toLowerCase()) throw clientError("You can't change your own role.");
  const { data } = await supabaseAdmin.from('admin_roles').update({ role: req.body.role }).eq('email', email).select('email');
  if (!data || !data.length) {
    const { error } = await supabaseAdmin.from('admin_roles').insert({ email, role: req.body.role, created_by: req.user.email });
    throwIf(error, 'save account');
  }
  let invited = false;
  if (req.body.invite === true && supabaseAdmin.auth.admin.inviteUserByEmail) {
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: `${settings.siteUrl()}/admin/login.html` });
    invited = !inviteError;
    if (inviteError) console.warn('[users] invite not sent:', inviteError.message);
  }
  await audit(req, 'user.role.set', { type: 'user', id: email, details: { role: req.body.role } });
  res.json({ success: true, invited, message: invited ? 'Role saved and invitation emailed.' : 'Role saved. This person can sign in with an existing account for this email.' });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const { error } = await supabaseAdmin.from('admin_roles').delete().eq('email', email);
  throwIf(error, 'remove account');
  await audit(req, 'user.role.remove', { type: 'user', id: email });
  res.json({ success: true, message: 'Access removed.' });
});

// ---------- Audit log ----------
exports.listAudit = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 50;
  const from = (page - 1) * perPage;
  const { data, error, count } = await supabaseAdmin.from('admin_audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + perPage - 1);
  throwIf(error, 'load the activity log');
  res.json({ success: true, entries: data || [], page, totalPages: Math.max(1, Math.ceil((count || 0) / perPage)) });
});

// ---------- Analytics: real numbers already recorded by the site ----------
exports.analytics = asyncHandler(async (req, res) => {
  const days = 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [clicks, products, subs, messages] = await Promise.all([
    supabaseAdmin.from('product_clicks').select('product_id, created_at').gte('created_at', since).limit(50000),
    supabaseAdmin.from('products').select('id, name, status'),
    supabaseAdmin.from('subscribers').select('status, created_at').limit(100000),
    supabaseAdmin.from('contact_messages').select('id', { count: 'exact', head: true }).gte('created_at', since)
  ]);
  throwIf(clicks.error || products.error || subs.error || messages.error, 'load analytics');
  const names = new Map((products.data || []).map((p) => [p.id, String(p.name).trim()]));
  const byProduct = {};
  const byDay = {};
  (clicks.data || []).forEach((c) => {
    byProduct[c.product_id] = (byProduct[c.product_id] || 0) + 1;
    const day = String(c.created_at).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const statusCounts = {};
  (products.data || []).forEach((p) => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
  res.json({
    success: true,
    days,
    clicks: {
      total: (clicks.data || []).length,
      perDay: Array.from({ length: days }, (_, i) => {
        const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return { date, count: byDay[date] || 0 };
      }),
      topProducts: Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ id: Number(id), name: names.get(Number(id)) || 'Deleted product', count }))
    },
    products: statusCounts,
    subscribers: {
      confirmed: (subs.data || []).filter((s) => s.status === 'confirmed').length,
      newLast30: (subs.data || []).filter((s) => s.created_at >= since).length
    },
    messagesLast30: messages.count || 0
  });
});

// ---------- System health ----------
exports.health = asyncHandler(async (req, res) => {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const started = Date.now();
  const { error: dbError } = await supabaseAdmin.from('products').select('id', { head: true }).limit(1);
  add('Database', !dbError, dbError ? 'Unreachable' : `Responded in ${Date.now() - started} ms`);

  const tables = ['media', 'site_settings', 'pages', 'banners', 'admin_roles', 'admin_audit_log', 'ai_instructions', 'ai_knowledge', 'ai_usage_logs', 'secure_settings', 'media_folders', 'email_campaigns', 'email_logs', 'product_clicks'];
  const results = await Promise.all(tables.map((t) => supabaseAdmin.from(t).select('*', { head: true }).limit(1)));
  const missing = tables.filter((_, i) => results[i].error);
  add('Database migrations', !missing.length, missing.length ? `Missing: ${missing.join(', ')}. Run the files in database/migrations.` : 'All tables present');

  const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket(BUCKET);
  const bucketMissing = !bucket && (!bucketError || /not found/i.test(bucketError.message));
  add('Media storage', !!(bucket && bucket.public !== false) || bucketMissing, bucket ? `Bucket "${BUCKET}" ready, ${bucket.public === false ? 'not public, so images won’t display' : 'public'}` : bucketMissing ? 'Created automatically on the first upload' : 'Unreachable');

  add('Email (Resend)', isConfigured(), isConfigured() ? 'API key and sender are set' : 'Set RESEND_API_KEY and a sender address');
  add('Email delivery reports', !!process.env.RESEND_WEBHOOK_SECRET, process.env.RESEND_WEBHOOK_SECRET ? 'Webhook secret is set' : 'Set RESEND_WEBHOOK_SECRET');

  const all = await settings.loadAll();
  const keys = await providers.keyStatus();
  const active = keys.providers[all.ai.provider];
  add('AI provider', active.configured, active.configured ? `${active.label}, key from ${active.source}, model ${all.ai.model}` : `No key for ${active.label}`);
  add('Saved-key encryption', keys.canStoreKeys, keys.canStoreKeys ? 'SETTINGS_ENCRYPTION_KEY is set' : 'Optional: set SETTINGS_ENCRYPTION_KEY to save AI keys from the dashboard');

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    checks,
    runtime: { node: process.version, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), environment: process.env.NODE_ENV || 'development' }
  });
});
