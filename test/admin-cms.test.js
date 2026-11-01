const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startApp, ADMIN_EMAIL } = require('./helpers/harness');

let app;
const OWNER = { as: 'admin' };
const EDITOR = { as: 'editor' };
const ADMIN2 = { as: 'manager' };

const IMG = 'https://storage.test/storage/v1/object/public/product-images/library/a.webp';

before(async () => {
  app = await startApp({
    env: { GEMINI_API_KEY: 'gem-test-key-123456', AI_RATE_LIMIT_PER_MINUTE: '100000', SETTINGS_ENCRYPTION_KEY: 'unit-test-encryption-secret' },
    seed: {
      categories: [{ id: 1, name: 'Electronics', slug: 'electronics', icon: 'electronics' }, { id: 2, name: 'Kitchen', slug: 'kitchen', icon: 'home' }],
      products: [
        { id: 1, name: 'Live Product', slug: 'live-product', description: 'Original description, with its own words.', price: 1000, discount_percent: 0, category_id: 1, affiliate_link: 'https://shop.test/1', availability: 'in_stock', is_featured: true, is_deal: false, images: [IMG] }
      ],
      media: [{ id: 1, filename: 'a.webp', kind: 'image', mime_type: 'image/webp', url: IMG, thumb_url: IMG, storage_paths: ['library/a.webp'], size_bytes: 10 }],
      admin_roles: [{ email: 'editor@example.test', role: 'editor' }, { email: 'manager@example.test', role: 'admin' }]
    }
  });
  app.db.users.editor = { id: 'u3', email: 'editor@example.test', user_metadata: {}, app_metadata: {} };
  app.db.users.manager = { id: 'u4', email: 'manager@example.test', user_metadata: {}, app_metadata: {} };
});
after(() => app.close());
beforeEach(() => {
  app.ai.requests.length = 0;
  app.ai.reply = () => '<p>Improved text.</p>';
  app.ai.fail = null;
});

const uploadFile = async (buffer, type, name, as = 'admin', extra = {}) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`${app.base}/api/admin/media/upload`, { method: 'POST', headers: { cookie: `sb_token=${as}` }, body: form });
  return { status: res.status, json: await res.json() };
};
const png = () => sharp({ create: { width: 900, height: 600, channels: 4, background: '#335577' } }).png().toBuffer();
const saveSettings = (group, body, opts = OWNER) => app.put(`/api/admin/settings/${group}`, body, opts);

// ---------- Access control ----------
test('every dashboard API refuses visitors and non-admin accounts', async () => {
  const routes = ['/api/admin/media', '/api/admin/products', '/api/admin/settings', '/api/admin/pages', '/api/admin/banners', '/api/admin/ai/config', '/api/admin/ai/instructions', '/api/admin/ai/knowledge', '/api/admin/ai/activity', '/api/admin/users', '/api/admin/audit', '/api/admin/health', '/api/admin/analytics'];
  for (const url of routes) {
    assert.equal((await app.get(url)).status, 401, url);
    assert.equal((await app.get(url, { as: 'visitor' })).status, 403, url);
  }
  assert.equal((await app.post('/api/admin/ai/generate', { action: 'improve', text: 'x' })).status, 401);
  assert.equal((await app.get('/admin/preview/page/privacy')).status, 302);
});

test('roles limit what each person can do', async () => {
  // Editors work on content, but can't publish, configure, or touch keys and accounts
  assert.equal((await app.get('/api/admin/products', EDITOR)).status, 200);
  assert.equal((await app.post('/api/admin/products/1/publish', {}, EDITOR)).status, 403);
  assert.equal((await saveSettings('identity', { site_name: 'Hacked' }, EDITOR)).status, 403);
  assert.equal((await app.get('/api/admin/ai/config', EDITOR)).status, 403);
  assert.equal((await app.get('/api/admin/users', EDITOR)).status, 403);
  assert.equal((await app.get('/api/admin/email/subscribers', EDITOR)).status, 403);
  // Admins configure the site, but only owners manage keys and accounts
  assert.equal((await app.get('/api/admin/ai/config', ADMIN2)).status, 200);
  assert.equal((await app.put('/api/admin/ai/key', { provider: 'gemini', key: 'abcdefghijklmnop' }, ADMIN2)).status, 403);
  assert.equal((await app.get('/api/admin/users', ADMIN2)).status, 403);
  const me = await app.get('/api/auth/me', EDITOR);
  assert.equal(me.json.user.role, 'editor');
  assert.ok(!me.json.user.permissions.includes('settings.manage'));
});

test('owners manage accounts, and role changes are audited', async () => {
  assert.equal((await app.put('/api/admin/users', { email: 'new@example.test', role: 'owner' }, OWNER)).status, 400, 'owner is not assignable');
  assert.equal((await app.put('/api/admin/users', { email: ADMIN_EMAIL, role: 'editor' }, OWNER)).status, 400, 'no changing your own role');
  assert.equal((await app.put('/api/admin/users', { email: 'New@Example.test', role: 'editor' }, OWNER)).status, 200);
  app.db.users.newbie = { id: 'u9', email: 'new@example.test', user_metadata: {}, app_metadata: {} };
  assert.equal((await app.get('/api/admin/products', { as: 'newbie' })).status, 200);
  assert.equal((await app.del(`/api/admin/users/${encodeURIComponent('new@example.test')}`, OWNER)).status, 200);
  assert.equal((await app.get('/api/admin/products', { as: 'newbie' })).status, 403);
  const log = app.db.table('admin_audit_log');
  assert.ok(log.some((l) => l.action === 'user.role.set' && l.target_id === 'new@example.test' && l.actor_email === ADMIN_EMAIL));
  assert.ok(log.some((l) => l.action === 'user.role.remove'));
});

// ---------- Media ----------
test('images upload to permanent storage with thumbnails and metadata', async () => {
  const { status, json } = await uploadFile(await png(), 'image/png', 'Hero Shot.png', 'admin', { alt_text: 'A hero', category: 'Banners' });
  assert.equal(status, 201);
  assert.match(json.item.url, /^https:\/\/storage\.test\/.*opt-.*\.webp$/);
  assert.match(json.item.thumb_url, /-w480\.webp$/);
  assert.equal(json.item.filename, 'Hero Shot.png');
  assert.equal(json.item.width, 900);
  assert.equal(json.item.height, 600);
  assert.equal(json.item.alt_text, 'A hero');
  assert.ok(json.item.size_bytes > 0);
  assert.equal(json.item.uploaded_by, ADMIN_EMAIL);
});

test('files are checked by their real contents', async () => {
  assert.equal((await uploadFile(Buffer.from('<?php evil(); ?>'), 'image/png', 'evil.png')).status, 400);
  assert.equal((await uploadFile(Buffer.from('MZ binary'), 'application/x-msdownload', 'evil.exe')).status, 400);
  assert.equal((await uploadFile(Buffer.from('not video at all'), 'video/mp4', 'fake.mp4')).status, 400);
  assert.equal((await uploadFile(Buffer.from('<html><script>alert(1)</script></html>'), 'image/svg+xml', 'fake.svg')).status, 400);
});

test('SVGs are stripped of scripts, event handlers and external links', async () => {
  const dirty = `<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><foreignObject><iframe src="https://evil.test"></iframe></foreignObject><a href="javascript:alert(3)"><path d="M0 0h10v10z" fill="#123456"/></a><image href="https://evil.test/x.png"/></svg>`;
  const { status, json } = await uploadFile(Buffer.from(dirty), 'image/svg+xml', 'logo.svg');
  assert.equal(status, 201);
  const key = [...app.db.objects.keys()].find((k) => k.endsWith('.svg'));
  const stored = app.db.objects.get(key).body.toString();
  assert.ok(stored.includes('<path') && stored.includes('viewBox'), stored);
  for (const bad of ['script', 'onload', 'foreignObject', 'iframe', 'javascript:', 'evil.test']) assert.ok(!stored.includes(bad), `${bad} survived: ${stored}`);
  assert.equal(json.item.mime_type, 'image/svg+xml');
});

test('videos and PDFs are stored; oversized files are refused', async () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(100)]);
  const video = await uploadFile(mp4, 'video/mp4', 'clip.mp4');
  assert.equal(video.status, 201);
  assert.equal(video.json.item.kind, 'video');
  const pdf = await uploadFile(Buffer.from('%PDF-1.4 test'), 'application/pdf', 'guide.pdf');
  assert.equal(pdf.json.item.kind, 'document');
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(11 * 1024 * 1024)]);
  assert.equal((await uploadFile(big, 'image/png', 'big.png')).status, 400);
});

test('search, filter, folders, rename and metadata all work', async () => {
  const { json: { item } } = await uploadFile(await png(), 'image/png', 'findme-banner.png');
  assert.equal((await app.get('/api/admin/media?q=FINDME', OWNER)).json.total, 1);
  assert.equal((await app.get(`/api/admin/media?q=${encodeURIComponent('%')}`, OWNER)).json.total, 0);
  assert.ok((await app.get('/api/admin/media?kind=video', OWNER)).json.items.every((m) => m.kind === 'video'));

  const folder = (await app.post('/api/admin/media/folders', { name: 'Summer' }, OWNER)).json.folder;
  assert.equal((await app.post('/api/admin/media/folders', { name: 'Summer' }, OWNER)).status, 409);
  const renamed = await app.req('PATCH', `/api/admin/media/${item.id}`, { body: { filename: 'renamed.png', alt_text: 'Alt', title: 'T', description: 'D', folder_id: folder.id }, ...OWNER });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.item.filename, 'renamed.png');
  assert.equal(renamed.json.item.url, item.url, 'renaming never breaks the URL');
  assert.equal((await app.get(`/api/admin/media?folder=${folder.id}`, OWNER)).json.total, 1);

  assert.equal((await app.del(`/api/admin/media/folders/${folder.id}`, OWNER)).status, 200);
  assert.equal((await app.get(`/api/admin/media?q=renamed`, OWNER)).json.items[0].folder_id, null, 'files survive their folder');
});

test('a file in use needs confirmation to delete; shared files outlive their products', async () => {
  const check = await app.get('/api/admin/media/1/usage', OWNER);
  assert.ok(check.json.usage.some((u) => u.type === 'Product' && u.name === 'Live Product'));
  const blocked = await app.del('/api/admin/media/1', OWNER);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.inUse, true);
  assert.ok(app.db.table('media').some((m) => m.id === 1), 'still there');

  // Deleting a product must not delete a shared library file
  const { json: { item } } = await uploadFile(await png(), 'image/png', 'shared.png');
  const created = await app.post('/api/admin/products', { name: 'Temp product', images: [item.url] }, OWNER);
  const before = app.db.objects.size;
  await app.del(`/api/admin/products/${created.json.id}`, OWNER);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(app.db.objects.size, before, 'file kept');

  assert.equal((await app.del(`/api/admin/media/${item.id}`, OWNER)).status, 200, 'unused now');
  assert.equal(app.db.objects.size, before - item_paths(item), 'all copies removed');
  assert.ok(app.db.table('admin_audit_log').some((l) => l.action === 'media.delete'));
});
const item_paths = () => 3;

// ---------- Products workflow ----------
test('drafts never reach the public; publish validates everything at once', async () => {
  const { status, json } = await app.post('/api/admin/products', {}, OWNER);
  assert.equal(status, 201);
  assert.equal(json.status, 'draft');
  const id = json.id;
  const row = app.db.table('products').find((p) => p.id === id);

  assert.equal((await app.get(`/api/products/${id}`)).status, 404);
  assert.equal((await app.get(`/product-details.html?slug=${row.slug}`)).status, 404);
  assert.ok(!(await app.get('/api/products?perPage=100')).json.items.some((p) => p.id === id));
  assert.ok(!(await app.get('/api/public/products')).json.data.products.some((p) => p.id === id));
  assert.ok(!(await app.get('/sitemap.xml')).text.includes(row.slug));

  const invalid = await app.post(`/api/admin/products/${id}/publish`, {}, OWNER);
  assert.equal(invalid.status, 422);
  assert.deepEqual(Object.keys(invalid.json.fieldErrors).sort(), ['affiliate_link', 'description', 'images', 'name', 'price']);

  const save = await app.put(`/api/admin/products/${id}/draft`, { name: 'Real name', price: 2500, discount_percent: 10, affiliate_link: 'https://shop.test/new?x=1&y=2', description: '<p>Nice <strong>thing</strong></p><script>alert(1)</script>', images: [IMG], short_description: 'Short', seo_title: 'SEO title', seo_description: 'SEO desc', category_id: 2, specifications: { Colour: 'Red' } }, OWNER);
  assert.equal(save.status, 200);
  assert.ok(save.json.draft_saved_at);
  assert.equal(row.price, 0, 'autosave does not touch live columns');

  const published = await app.post(`/api/admin/products/${id}/publish`, {}, OWNER);
  assert.equal(published.status, 200);
  const live = await app.get(`/api/products/${id}`);
  assert.equal(live.status, 200);
  assert.equal(live.json.product.name, 'Real name');
  assert.equal(live.json.product.description, '<p>Nice <strong>thing</strong></p>', 'scripts removed');
  assert.equal(live.json.product.description_format, 'html');
  assert.equal(live.json.product.final_price, 2250);
  assert.equal(live.json.product.affiliate_link, 'https://shop.test/new?x=1&y=2');
  assert.equal(live.json.product.draft, undefined);
  const page = await app.get(`/product-details.html?slug=${row.slug}`);
  assert.ok(page.text.includes('<title id="pageTitle">SEO title —'));
  assert.ok(page.text.includes('content="SEO desc"'));
});

test('editing a live product keeps the original public until Publish; discard restores it', async () => {
  const original = 'Original description, with its own words.';
  await app.put('/api/admin/products/1/draft', { description: '<p>AI rewrote this</p>' }, OWNER);
  assert.equal((await app.get('/api/products/1')).json.product.description, original);
  const admin = await app.get('/api/admin/products/1', OWNER);
  assert.equal(admin.json.product.description, '<p>AI rewrote this</p>');
  assert.equal(admin.json.live.description, original);
  assert.equal(admin.json.product.has_draft, true);

  const preview = await app.get('/api/admin/products/1/preview', OWNER);
  assert.equal(preview.json.product.description, '<p>AI rewrote this</p>');
  assert.equal(preview.json.product.description_format, 'html');
  assert.equal((await app.get('/api/admin/products/1/preview')).status, 401);

  assert.equal((await app.del('/api/admin/products/1/draft', OWNER)).status, 200);
  assert.equal((await app.get('/api/admin/products/1', OWNER)).json.product.description, original);
  assert.equal((await app.get('/api/products/1')).json.product.description_format, 'text', 'old text still displays as text');
});

test('an editor can draft and request review, but only an admin can publish', async () => {
  const { json } = await app.post('/api/admin/products', { name: 'By editor', price: 10, affiliate_link: 'https://shop.test/e', description: '<p>x</p>', images: [IMG] }, EDITOR);
  assert.equal((await app.post(`/api/admin/products/${json.id}/status`, { status: 'pending_review' }, EDITOR)).status, 200);
  assert.equal((await app.get(`/api/products/${json.id}`)).status, 404, 'review items are not public');
  assert.equal((await app.post(`/api/admin/products/${json.id}/status`, { status: 'archived' }, EDITOR)).status, 403);
  assert.equal((await app.post(`/api/admin/products/${json.id}/publish`, {}, ADMIN2)).status, 200);
  assert.equal((await app.get(`/api/products/${json.id}`)).status, 200);
  assert.equal((await app.post(`/api/admin/products/${json.id}/status`, { status: 'archived' }, ADMIN2)).status, 200);
  assert.equal((await app.get(`/api/products/${json.id}`)).status, 404, 'archived leaves the site');
  assert.equal((await app.get(`/api/admin/products?status=archived`, OWNER)).json.items.length >= 1, true);
});

test('scheduled products publish when their time comes', async () => {
  const { json } = await app.post('/api/admin/products', { name: 'Coming soon', price: 10, affiliate_link: 'https://shop.test/s', description: '<p>x</p>', images: [IMG] }, OWNER);
  assert.equal((await app.post(`/api/admin/products/${json.id}/status`, { status: 'scheduled', publish_at: '2000-01-01T00:00:00Z' }, OWNER)).status, 400);
  const future = new Date(Date.now() + 3600000).toISOString();
  assert.equal((await app.post(`/api/admin/products/${json.id}/status`, { status: 'scheduled', publish_at: future }, OWNER)).status, 200);
  assert.equal((await app.get(`/api/products/${json.id}`)).status, 404);

  const { publishDue } = require('../controllers/productAdminController');
  await publishDue();
  assert.equal((await app.get(`/api/products/${json.id}`)).status, 404, 'not yet');
  app.db.table('products').find((p) => p.id === json.id).publish_at = new Date(Date.now() - 1000).toISOString();
  await publishDue();
  assert.equal((await app.get(`/api/products/${json.id}`)).status, 200);
});

test('product images must come from the media library', async () => {
  const bad = await app.put('/api/admin/products/1/draft', { images: ['https://evil.test/x.png'] }, OWNER);
  assert.equal(bad.status, 400);
  assert.ok(bad.json.fieldErrors.images);
  assert.equal((await app.put('/api/admin/products/1/draft', { images: 'nope' }, OWNER)).status, 400);
  assert.equal((await app.put('/api/admin/products/1/draft', { price: -5 }, OWNER)).status, 400);
  assert.equal((await app.put('/api/admin/products/1/draft', { rating: 5 }, OWNER)).status, 400, 'half a rating');
});

// ---------- Settings applied across the site ----------
test('identity and SEO settings change the served pages, and are validated', async () => {
  assert.equal((await saveSettings('identity', { site_name: 'x'.repeat(200) })).status, 400);
  assert.equal((await saveSettings('identity', { logo: 'javascript:alert(1)' })).status, 400);
  assert.equal((await saveSettings('identity', { contact_email: 'nope' })).status, 400);

  assert.equal((await saveSettings('identity', { site_name: 'Acme <Deals>', logo: IMG, favicon: IMG, phone: '12345' })).status, 200);
  assert.equal((await saveSettings('seo', { meta_title: 'Acme meta title', meta_description: 'Acme meta description', google_verification: 'gverify123', og_image: IMG, twitter_handle: '@acme' })).status, 200);

  const home = await app.get('/');
  assert.ok(home.text.includes('<title>Acme meta title</title>'));
  assert.ok(home.text.includes('content="Acme meta description"'));
  assert.ok(home.text.includes('google-site-verification" content="gverify123"'));
  assert.ok(home.text.includes(`<link rel="icon" href="${IMG}"`));
  assert.ok(home.text.includes(`property="og:image" content="${IMG}"`));
  assert.ok(!home.text.includes('Acme <Deals>'), 'site name is escaped');
  assert.ok((await app.get('/about.html')).text.includes('Acme &lt;Deals&gt;'), 'name applies on every page');

  const config = await app.get('/site-config.js');
  assert.match(config.headers.get('content-type'), /javascript/);
  assert.ok(config.text.includes(IMG), 'logo reaches the browser');
  assert.ok(!config.text.includes('<Deals'), 'cannot break out of a script tag');
  await saveSettings('identity', { site_name: 'SHEREBOY AFFILIATE CONCEPT', logo: '', favicon: '', phone: '2347055426419' });
  await saveSettings('seo', { google_verification: '', og_image: '', twitter_handle: '', meta_title: 'SHEREBOY AFFILIATE CONCEPT — Smart finds. Honest prices.' });
});

test('appearance previews without saving; saving changes the theme everywhere', async () => {
  const preview = await app.post('/api/admin/settings/appearance/preview', { primary: '#AA0000' }, OWNER);
  assert.ok(preview.json.css.includes('--teal-700: #AA0000'));
  assert.ok(!(await app.get('/theme.css')).text.includes('#AA0000'), 'preview stores nothing');
  assert.equal((await app.post('/api/admin/settings/appearance/preview', { primary: 'red;}body{display:none' }, OWNER)).status, 400, 'no CSS injection');

  const before = (await app.get('/')).text.match(/theme\.css\?v=(\d+)/)[1];
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await saveSettings('appearance', { primary: '#AA0000', button_style: 'pill', border_radius: 'large', base_font_size: 18, default_theme: 'dark', allow_theme_toggle: true, product_columns: '4' })).status, 200);
  const css = (await app.get('/theme.css')).text;
  assert.ok(css.includes('--teal-700: #AA0000'));
  assert.ok(css.includes('--btn-radius: 999px'));
  assert.ok(css.includes('font-size: 112.5%'));
  assert.ok(css.includes('repeat(4, minmax(0, 1fr))'));
  assert.ok(css.includes('[data-theme="dark"]'));
  const after = (await app.get('/')).text.match(/theme\.css\?v=(\d+)/)[1];
  assert.notEqual(before, after, 'browsers fetch the new theme straight away');
  assert.ok((await app.get('/site-config.js')).text.includes('"default":"dark"'));
  await saveSettings('appearance', { primary: '#0F766E', button_style: 'rounded', border_radius: 'medium', base_font_size: 16, default_theme: 'light', allow_theme_toggle: false, product_columns: 'auto' });
});

test('homepage settings: hero, order, switched-off sections, picked products, banners', async () => {
  await saveSettings('homepage', {
    hero_headline: 'Big <news>',
    hero_highlight: 'Today',
    hero_description: 'New words here.',
    hero_background: IMG,
    featured_product_ids: [1],
    sections: [{ key: 'deals', enabled: true }, { key: 'featured', enabled: false }],
    promo_enabled: true,
    promo_message: 'Free guide this week',
    promo_link: '/faq.html'
  });
  const home = await app.get('/');
  assert.ok(home.text.includes('Big &lt;news&gt;<br /><em>Today</em>'));
  assert.ok(home.text.includes('New words here.'));
  assert.ok((await app.get('/theme.css')).text.includes(IMG));
  assert.ok((await app.get('/site-config.js')).text.includes('Free guide this week'));
  const data = (await app.get('/api/home')).json;
  assert.equal(data.sections[0].key, 'deals');
  assert.equal(data.sections[1].enabled, false);
  assert.equal(data.sections.length, 9, 'unsent sections are kept');
  assert.deepEqual(data.featured.map((p) => p.id), [1]);

  const created = await app.post('/api/admin/banners', { title: 'Sale', message: 'Big sale', image_url: IMG, link_url: '/products.html', placement: 'home_top' }, OWNER);
  assert.equal(created.status, 201);
  await app.post('/api/admin/banners', { title: 'Old', placement: 'home_top', ends_at: '2000-01-01' }, OWNER);
  await app.post('/api/admin/banners', { title: 'Off', placement: 'home_top', is_active: false }, OWNER);
  assert.equal((await app.post('/api/admin/banners', { title: 'Bad', placement: 'home_top', link_url: 'javascript:alert(1)' }, OWNER)).status, 400);
  assert.deepEqual((await app.get('/api/home')).json.banners.map((b) => b.title), ['Sale'], 'only active and in date');
  await app.del(`/api/admin/banners/${created.json.banner.id}`, OWNER);
  assert.deepEqual((await app.get('/api/home')).json.banners, []);
  await saveSettings('homepage', { hero_headline: 'Smart finds.', hero_highlight: 'Honest prices.', hero_description: 'x', hero_background: '', featured_product_ids: [], promo_enabled: false, sections: require('../services/homeSections').BRAND_DEFAULT_SECTIONS });
});

test('robots and sitemap follow SEO settings', async () => {
  await saveSettings('seo', { sitemap_products: false, robots_extra: 'Disallow: /private/' });
  assert.ok(!(await app.get('/sitemap.xml')).text.includes('product-details'));
  assert.ok((await app.get('/robots.txt')).text.includes('Disallow: /private/'));
  await saveSettings('seo', { allow_indexing: false });
  assert.ok((await app.get('/robots.txt')).text.includes('Disallow: /\n'));
  assert.ok((await app.get('/')).text.includes('noindex'));
  await saveSettings('seo', { allow_indexing: true, sitemap_products: true, robots_extra: '' });
});

test('regional settings reach prices and structured data; bad values are refused', async () => {
  assert.equal((await saveSettings('regional', { timezone: 'Mars/Base' })).status, 400);
  assert.equal((await saveSettings('regional', { currency: 'dollars' })).status, 400);
  await saveSettings('regional', { currency: 'GHS', locale: 'en-GH', timezone: 'Africa/Accra' });
  assert.ok((await app.get('/site-config.js')).text.includes('"currency":"GHS"'));
  assert.ok((await app.get('/product-details.html?slug=live-product')).text.includes('"priceCurrency":"GHS"'));
  await saveSettings('regional', { currency: 'NGN', locale: 'en-NG', timezone: 'Africa/Lagos' });
});

test('email settings: sender, signup switch, notifications', async () => {
  await saveSettings('email', { sender_name: 'Acme', sender_email: 'hello@acme.test', reply_to: 'help@acme.test', notify_email: 'owner@acme.test', notify_contact_message: true });
  app.resend.emails.length = 0;
  await app.post('/api/newsletter/subscribe', { email: 'sender-check@example.test' });
  assert.equal(app.resend.emails[0].from, 'Acme <hello@acme.test>');
  assert.equal(app.resend.emails[0].reply_to, 'help@acme.test');
  await app.post('/api/contact/message', { name: 'Ada', email: 'ada@example.test', message: 'A long enough message.' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(app.resend.emails.some((e) => e.to[0] === 'owner@acme.test'));

  await saveSettings('email', { newsletter_enabled: false });
  assert.equal((await app.post('/api/newsletter/subscribe', { email: 'closed@example.test' })).status, 403);
  await saveSettings('email', { newsletter_enabled: true, sender_name: '', sender_email: '', reply_to: '', notify_email: '', notify_contact_message: false });

  const { text } = await app.get('/api/admin/settings', OWNER);
  assert.ok(!text.includes('re_test_key'), 'API key never leaves the server');
});

test('legal pages: draft stays private until published; HTML is cleaned', async () => {
  const pages = (await app.get('/api/admin/pages', OWNER)).json.pages;
  assert.equal(pages.length, 5);
  const privacy = pages.find((p) => p.slug === 'privacy');
  assert.ok(privacy.draft_html.includes('<'), 'starts from the current page text');
  assert.equal((await app.get('/cookie-policy.html')).status, 404, 'unpublished page does not exist');

  assert.equal((await app.post('/api/admin/pages/cookie-policy/publish', {}, OWNER)).status, 409);
  await app.put('/api/admin/pages/cookie-policy', { title: 'Cookie Policy', draft_html: '<h2>Cookies</h2><p>We use few.</p><script>alert(1)</script><img src=x onerror=alert(2)>' }, OWNER);
  assert.equal((await app.get('/cookie-policy.html')).status, 404, 'a draft is not public');
  const preview = await fetch(`${app.base}/admin/preview/page/cookie-policy`, { headers: { cookie: 'sb_token=admin' } });
  assert.ok((await preview.text()).includes('We use few.'));
  assert.ok(!(await app.get('/site-config.js')).text.includes('cookie-policy'), 'not in the footer yet');

  assert.equal((await app.post('/api/admin/pages/cookie-policy/publish', {}, EDITOR)).status, 403);
  assert.equal((await app.post('/api/admin/pages/cookie-policy/publish', {}, OWNER)).status, 200);
  const live = await app.get('/cookie-policy.html');
  assert.equal(live.status, 200);
  assert.ok(live.text.includes('We use few.'));
  assert.ok(!live.text.includes('alert(') && !live.text.includes('onerror'));
  assert.ok((await app.get('/site-config.js')).text.includes('cookie-policy'));

  await app.put('/api/admin/pages/cookie-policy', { title: 'Cookie Policy', draft_html: '<p>Newer draft</p>' }, OWNER);
  assert.ok(!(await app.get('/cookie-policy.html')).text.includes('Newer draft'), 'the published version stays until republished');
  assert.ok((await app.get('/terms.html')).text.includes('Terms'), 'unmanaged pages keep their existing text');
});

// ---------- AI ----------
test('API keys are encrypted at rest and never returned', async () => {
  const secret = 'sk-very-secret-value-000111';
  assert.equal((await app.put('/api/admin/ai/key', { provider: 'openai', key: secret }, OWNER)).status, 200);
  const row = app.db.table('secure_settings').find((r) => r.key === 'ai_key_openai');
  assert.ok(row && !row.ciphertext.includes(secret));
  for (const url of ['/api/admin/ai/config', '/api/admin/settings', '/api/admin/health', '/api/admin/audit']) {
    assert.ok(!(await app.get(url, OWNER)).text.includes(secret), url);
  }
  const config = (await app.get('/api/admin/ai/config', OWNER)).json;
  assert.equal(config.keys.providers.openai.source, 'dashboard');
  assert.equal(config.keys.providers.gemini.source, 'environment');
  assert.ok(!JSON.stringify(app.db.table('admin_audit_log')).includes(secret));
  assert.equal((await app.del('/api/admin/ai/key/openai', OWNER)).status, 200);
});

test('the connection test makes a real request and reports the truth', async () => {
  const ok = await app.post('/api/admin/ai/test', { provider: 'gemini' }, OWNER);
  assert.equal(ok.json.connected, true);
  assert.deepEqual(ok.json.models, ['gemini-test-model']);
  assert.equal(app.ai.requests.at(-1).headers['x-goog-api-key'], 'gem-test-key-123456');
  app.ai.fail = { status: 403, message: 'bad key' };
  const bad = await app.post('/api/admin/ai/test', { provider: 'gemini' }, OWNER);
  assert.equal(bad.json.connected, false);
  assert.match(bad.json.message, /rejected the API key/);
  const none = await app.post('/api/admin/ai/test', { provider: 'anthropic' }, OWNER);
  assert.equal(none.json.connected, false);
  assert.match(none.json.message, /No API key/);
});

test('saved instructions persist and are really sent to the AI; disabled ones are not', async () => {
  const on = await app.post('/api/admin/ai/instructions', { title: 'Tone', body: 'Always mention the word SHEREBOYTONE.', category: 'general' }, OWNER);
  assert.equal(on.status, 201);
  const scoped = await app.post('/api/admin/ai/instructions', { title: 'Desc rule', body: 'Descriptions use the word DESCRULE.', category: 'product_descriptions' }, OWNER);
  await app.post('/api/admin/ai/instructions', { title: 'Mail rule', body: 'Emails use the word MAILRULE.', category: 'email' }, OWNER);
  await app.post('/api/admin/ai/instructions', { title: 'Off', body: 'Never use DISABLEDRULE.', category: 'general', is_enabled: false }, OWNER);
  assert.equal((await app.post('/api/admin/ai/instructions', { body: 'x', category: 'general' }, OWNER)).status, 400);
  assert.equal((await app.post('/api/admin/ai/instructions', { body: 'valid text', category: 'nope' }, OWNER)).status, 400);
  assert.ok((await app.get('/api/admin/ai/instructions', OWNER)).json.instructions.length >= 4, 'persisted');

  const res = await app.post('/api/admin/ai/generate', { action: 'improve', text: '<p>Some product text</p>', product: { name: 'Lamp' } }, OWNER);
  assert.equal(res.status, 200);
  assert.equal(res.json.suggestion, '<p>Improved text.</p>');
  const sent = app.ai.requests.at(-1).body;
  const system = sent.system_instruction.parts[0].text;
  assert.ok(system.includes('SHEREBOYTONE'));
  assert.ok(system.includes('DESCRULE'), 'rules for this kind of work apply');
  assert.ok(!system.includes('MAILRULE'), 'rules for other work do not');
  assert.ok(!system.includes('DISABLEDRULE'));
  assert.ok(system.includes('Never invent'), 'safety rules are always present');
  assert.ok(sent.contents[0].parts[0].text.includes('<user_text>'));
  assert.deepEqual(res.json.appliedInstructions.sort(), ['Desc rule', 'Tone']);

  await app.put(`/api/admin/ai/instructions/${scoped.json.instruction.id}`, { title: 'Desc rule', body: 'Updated DESCNEW.', category: 'product_descriptions' }, OWNER);
  await app.post('/api/admin/ai/generate', { action: 'improve', text: 'text' }, OWNER);
  assert.ok(app.ai.requests.at(-1).body.system_instruction.parts[0].text.includes('DESCNEW'));
  await app.del(`/api/admin/ai/instructions/${on.json.instruction.id}`, OWNER);
  await app.post('/api/admin/ai/generate', { action: 'improve', text: 'text' }, OWNER);
  assert.ok(!app.ai.requests.at(-1).body.system_instruction.parts[0].text.includes('SHEREBOYTONE'));

  const preview = await app.post('/api/admin/ai/instructions/preview', { capability: 'description' }, OWNER);
  assert.ok(preview.json.prompt.includes('DESCNEW'));
  app.ai.reply = () => 'I will use DESCNEW.';
  const interpreted = await app.post('/api/admin/ai/instructions/preview', { capability: 'description', run: true }, OWNER);
  assert.equal(interpreted.json.interpretation, 'I will use DESCNEW.');
});

test('knowledge base: relevant passages are retrieved as data, disabled ones never', async () => {
  await app.post('/api/admin/ai/knowledge', { title: 'Lamp guide', category: 'writing', body: 'When writing about lamps, mention LAMPFACT brightness.' }, OWNER);
  await app.post('/api/admin/ai/knowledge', { title: 'Shoe guide', category: 'general', body: 'Footwear sizing notes SHOEFACT.' }, OWNER);
  await app.post('/api/admin/ai/knowledge', { title: 'Hidden', category: 'writing', body: 'Lamps secret HIDDENFACT.', is_enabled: false }, OWNER);

  const res = await app.post('/api/admin/ai/generate', { action: 'rewrite', text: 'A lovely lamp for lamps lovers', product: { name: 'Desk lamp lamps' } }, OWNER);
  const system = app.ai.requests.at(-1).body.system_instruction.parts[0].text;
  assert.ok(system.includes('LAMPFACT'));
  assert.ok(!system.includes('SHOEFACT'), 'unrelated knowledge is left out');
  assert.ok(!system.includes('HIDDENFACT'));
  assert.ok(system.indexOf('<knowledge>') > system.indexOf('Never invent'), 'knowledge comes after, and separate from, the safety rules');
  assert.ok(res.json.usedKnowledge.includes('Lamp guide'));
});

test('documents upload into the knowledge base; unsupported types are refused', async () => {
  const send = async (buffer, name) => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), name);
    form.append('category', 'brand');
    const r = await fetch(`${app.base}/api/admin/ai/knowledge/upload`, { method: 'POST', headers: { cookie: 'sb_token=admin' }, body: form });
    return { status: r.status, json: await r.json() };
  };
  const txt = await send(Buffer.from('Brand voice: calm and clear.'), 'brand.txt');
  assert.equal(txt.status, 201);
  assert.equal(txt.json.entry.source_filename, 'brand.txt');
  assert.equal((await send(Buffer.from('MZ'), 'virus.exe')).status, 400);
  assert.equal((await send(Buffer.from('not really a pdf'), 'fake.pdf')).status, 400);

  // A real PDF, generated by a PDF library
  const real = await send(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'guide.pdf')), 'guide.pdf');
  assert.equal(real.status, 201, JSON.stringify(real.json));
  assert.match(real.json.entry.body, /Brand guideline from a PDF/);
});

test('switched-off capabilities and monthly limits really block requests', async () => {
  await app.put('/api/admin/ai/config', { capability_grammar: false }, OWNER);
  const count = app.ai.requests.length;
  const off = await app.post('/api/admin/ai/generate', { action: 'grammar', text: 'text' }, OWNER);
  assert.equal(off.status, 429);
  assert.match(off.json.message, /switched off/);
  assert.equal(app.ai.requests.length, count, 'the provider was never called');
  const available = (await app.get('/api/admin/ai/available', EDITOR)).json;
  assert.ok(!available.actions.grammar);
  assert.ok(available.actions.improve);
  await app.put('/api/admin/ai/config', { capability_grammar: true }, OWNER);

  await app.put('/api/admin/ai/config', { monthly_request_limit: 1 }, OWNER);
  const limited = await app.post('/api/admin/ai/generate', { action: 'improve', text: 'text' }, OWNER);
  assert.equal(limited.status, 429);
  assert.match(limited.json.message, /monthly limit/);
  await app.put('/api/admin/ai/config', { monthly_request_limit: 0, monthly_token_limit: 1 }, OWNER);
  assert.equal((await app.post('/api/admin/ai/generate', { action: 'improve', text: 'text' }, OWNER)).status, 429);
  await app.put('/api/admin/ai/config', { monthly_request_limit: 2000, monthly_token_limit: 2000000 }, OWNER);

  assert.equal((await app.put('/api/admin/ai/config', { temperature: 5 }, OWNER)).status, 400);
  assert.equal((await app.put('/api/admin/ai/config', { provider: 'skynet' }, OWNER)).status, 400);
});

test('all editor tools work, output is cleaned, and new claims are flagged', async () => {
  for (const action of ['improve', 'grammar', 'rewrite', 'persuasive', 'shorten', 'expand', 'seo', 'benefits', 'bullets']) {
    const res = await app.post('/api/admin/ai/generate', { action, text: '<p>Solid lamp</p>', product: { name: 'Lamp' } }, EDITOR);
    assert.equal(res.status, 200, action);
    assert.ok(res.json.suggestion, action);
  }
  assert.equal((await app.post('/api/admin/ai/generate', { action: 'custom', text: 'x' }, EDITOR)).status, 400, 'custom needs a request');
  const custom = await app.post('/api/admin/ai/generate', { action: 'custom', text: 'x', instruction: 'Make it about lamps' }, EDITOR);
  assert.equal(custom.status, 200);
  assert.ok(app.ai.requests.at(-1).body.contents[0].parts[0].text.includes('Make it about lamps'));
  assert.equal((await app.post('/api/admin/ai/generate', { action: 'hack', text: 'x' }, EDITOR)).status, 400);
  assert.equal((await app.post('/api/admin/ai/generate', { action: 'improve', text: '' }, EDITOR)).status, 400);

  app.ai.reply = () => '<p>Lasts 500 hours with a 2 years warranty, FDA approved.</p><script>alert(1)</script>';
  const risky = await app.post('/api/admin/ai/generate', { action: 'improve', text: '<p>A lamp that lasts 500 hours</p>' }, EDITOR);
  assert.ok(!risky.json.suggestion.includes('script'));
  assert.ok(risky.json.flags.some((f) => f.includes('2')), JSON.stringify(risky.json.flags));
  assert.ok(risky.json.flags.includes('warranty'));
  assert.ok(risky.json.flags.includes('fda'));
  assert.ok(!risky.json.flags.some((f) => f.startsWith('500')), 'facts from the source are fine');

  app.ai.reply = () => '```json\n{"seo_title":"Lamp","seo_description":"A lamp."}\n```';
  const seo = await app.post('/api/admin/ai/generate', { action: 'seo_meta', product: { name: 'Lamp' } }, EDITOR);
  assert.deepEqual(seo.json.fields, { seo_title: 'Lamp', seo_description: 'A lamp.' });
  app.ai.reply = () => 'not json at all';
  assert.equal((await app.post('/api/admin/ai/generate', { action: 'seo_meta', product: { name: 'Lamp' } }, EDITOR)).status, 502);
});

test('provider failures give useful messages, are logged, and activity adds up', async () => {
  app.ai.fail = { status: 429, message: 'quota' };
  const res = await app.post('/api/admin/ai/generate', { action: 'improve', text: 'text' }, OWNER);
  assert.equal(res.status, 502);
  assert.match(res.json.message, /usage limit/);
  app.ai.fail = null;
  await app.put('/api/admin/ai/config', { price_input_per_million: 1, price_output_per_million: 2 }, OWNER);
  await app.post('/api/admin/ai/generate', { action: 'improve', text: 'text' }, OWNER);

  const { json } = await app.get('/api/admin/ai/activity', OWNER);
  assert.ok(json.totals.success > 0 && json.totals.failed > 0 && json.totals.blocked > 0);
  assert.ok(json.totals.inputTokens > 0 && json.totals.outputTokens > 0);
  assert.ok(json.totals.estimatedCost > 0);
  assert.equal(json.features[0].name.length > 0, true);
  assert.ok(json.recent.length > 0 && json.models.length > 0);
  await app.put('/api/admin/ai/config', { price_input_per_million: 0, price_output_per_million: 0 }, OWNER);
});

test('the customer assistant uses the provider, its own rules, and only published products', async () => {
  await app.post('/api/admin/ai/instructions', { title: 'Chat', body: 'Greet with CHATRULE.', category: 'assistant' }, OWNER);
  const draft = await app.post('/api/admin/products', { name: 'Secret Unreleased Thing' }, OWNER);
  app.ai.reply = () => 'Hello!';
  const res = await app.post('/api/ai/chat', { message: 'What do you sell?' });
  assert.equal(res.json.reply, 'Hello!');
  const system = app.ai.requests.at(-1).body.system_instruction.parts[0].text;
  assert.ok(system.includes('CHATRULE'));
  assert.ok(system.includes('Live Product'));
  assert.ok(!system.includes('Secret Unreleased Thing'), 'drafts are invisible to the assistant');
  await app.del(`/api/admin/products/${draft.json.id}`, OWNER);

  await app.put('/api/admin/ai/config', { capability_assistant: false }, OWNER);
  const off = await app.post('/api/ai/chat', { message: 'hi' });
  assert.equal(off.json.configured, false);
  await app.put('/api/admin/ai/config', { capability_assistant: true }, OWNER);
});

test('health and analytics report real state; category images save', async () => {
  const { json } = await app.get('/api/admin/health', OWNER);
  assert.ok(json.checks.find((c) => c.name === 'Database').ok);
  assert.ok(json.checks.find((c) => c.name === 'AI provider').ok);
  assert.ok(json.runtime.node);
  await app.post('/api/products/1/click');
  const stats = await app.get('/api/admin/analytics', OWNER);
  assert.ok(stats.json.clicks.total >= 1);
  assert.equal(stats.json.clicks.perDay.length, 30);
  assert.equal(stats.json.clicks.topProducts[0].name, 'Live Product');

  const saved = await app.put('/api/categories/1', { name: 'Electronics', image_url: IMG }, OWNER);
  assert.equal(saved.json.category.image_url, IMG);
  assert.equal((await app.put('/api/categories/1', { name: 'Electronics', image_url: 'javascript:alert(1)' }, OWNER)).json.category.image_url, null);
});

test('the API response and page HTML never carry unpublished draft data', async () => {
  await app.put('/api/admin/products/1/draft', { description: '<p>UNPUBLISHEDTEXT</p>' }, OWNER);
  for (const url of ['/api/products?perPage=100', '/api/products/1', '/api/products/slug/live-product', '/api/home', '/api/public/products', '/product-details.html?slug=live-product']) {
    const home = require('../controllers/homeController');
    home.invalidateHomeCache();
    assert.ok(!(await app.get(url)).text.includes('UNPUBLISHEDTEXT'), url);
  }
  await app.del('/api/admin/products/1/draft', OWNER);
});
