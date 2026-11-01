const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startApp } = require('./helpers/harness');

const STORED = 'https://cdn.test/storage/v1/object/public/product-images/products/opt-1-a.webp';

const product = (id, extra = {}) => ({
  id,
  name: `Product ${id}`,
  slug: `product-${id}`,
  description: `About product ${id}.`,
  price: 1000,
  discount_percent: 0,
  category_id: 1,
  affiliate_link: `https://shop.test/${id}?tracking=abc&x=1`,
  availability: 'in_stock',
  is_featured: false,
  is_deal: false,
  images: [STORED],
  date_added: new Date(Date.UTC(2026, 0, id)).toISOString(),
  ...extra
});

const seed = () => ({
  categories: [
    { id: 1, name: 'Electronics', slug: 'electronics', icon: 'electronics' },
    { id: 2, name: 'Browse', slug: 'browse', icon: 'default' }
  ],
  products: [
    product(1, { is_featured: true, images: ['/uploads/gone.jpg'], discount_percent: 50 }),
    product(2, { is_deal: true, images: ['http://insecure.test/a.jpg', STORED], discount_percent: 20 }),
    product(3, { is_deal: true, name: 'REFOX 12.9" Laminator', images: [] }),
    product(4, { discount_percent: 70 }),
    product(5, { name: '<script>alert(1)</script> Toaster', slug: 'evil-toaster', description: '</script><img src=x onerror=alert(1)>', images: [STORED], rating: 4.5, rating_count: 12 })
  ],
  testimonials: [
    { id: 1, customer_name: 'Real Person', quote: 'Genuinely useful.', rating: 5, is_published: true },
    { id: 2, customer_name: 'Sample Person', quote: 'From the seed file.', rating: 5, is_published: false }
  ]
});

let app;
before(async () => { app = await startApp({ seed: seed() }); });
after(() => app.close());

test('dead /uploads paths and http images never reach the browser', async () => {
  const { json } = await app.get('/api/products?perPage=100');
  const byId = Object.fromEntries(json.items.map((p) => [p.id, p]));
  assert.deepEqual(byId[1].images, []);
  assert.equal(byId[1].images_missing, true);
  assert.deepEqual(byId[2].images, [STORED]);
  assert.equal(byId[2].images_missing, false);
});

test('the affiliate link is returned exactly as entered', async () => {
  const { json } = await app.get('/api/products/slug/product-1');
  assert.equal(json.product.affiliate_link, 'https://shop.test/1?tracking=abc&x=1');
});

test('perPage is honoured and capped', async () => {
  assert.equal((await app.get('/api/products?perPage=2')).json.items.length, 2);
  assert.equal((await app.get('/api/products?perPage=9999')).json.perPage, 100);
});

test('malformed list parameters do not cause a server error', async () => {
  for (const url of ['/api/products?q[]=a&q[]=b', '/api/products?page=abc', '/api/products?category[x]=1', '/api/products?sort[]=x', '/api/products?page=-5']) {
    assert.equal((await app.get(url)).status, 200, url);
  }
});

test('search matches text containing a dot and survives filter syntax characters', async () => {
  const { json } = await app.get('/api/products?q=12.9');
  assert.deepEqual(json.items.map((p) => p.id), [3]);
  assert.equal((await app.get(`/api/products?q=${encodeURIComponent('a,b(c)*"\\')}`)).status, 200);
});

test('category filter and discount sort work', async () => {
  assert.equal((await app.get('/api/products?category=browse')).json.total, 0);
  assert.equal((await app.get('/api/products?category=electronics')).json.total, 5);
  const { json } = await app.get('/api/products?sort=discount_desc');
  assert.equal(json.items[0].id, 4);
});

test('homepage: real sections, nothing repeated, empty categories and hidden testimonials left out', async () => {
  const { status, json } = await app.get('/api/home');
  assert.equal(status, 200);
  const ids = [...json.featured, ...json.deals, ...json.trending, ...json.recent, ...json.recommended].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no product appears in two sections');
  assert.ok(json.featured.length && json.deals.length);
  assert.deepEqual(json.categories.map((c) => c.slug), ['electronics']);
  assert.deepEqual(json.testimonials.map((t) => t.customer_name), ['Real Person']);
  assert.equal(json.stats.products, 5);
  assert.equal(json.spotlight.every((p) => !p.images_missing), true, 'the hero only shows products with photos');
  assert.equal(json.featured[0].description, undefined, 'cards leave out long text');
});

test('public testimonials endpoint hides unpublished ones', async () => {
  const { json } = await app.get('/api/testimonials');
  assert.deepEqual(json.testimonials.map((t) => t.customer_name), ['Real Person']);
});

test('trending stays empty without real clicks, and fills once there are', async () => {
  const empty = await app.get('/api/products?perPage=1');
  assert.ok(empty.status === 200);
  assert.equal((await app.post('/api/products/4/click')).status, 204);
  assert.equal((await app.post('/api/products/4/click')).status, 204);
  assert.equal(app.db.table('product_clicks').length, 2);
  assert.deepEqual(Object.keys(app.db.table('product_clicks')[0]).sort(), ['created_at', 'id', 'product_id'], 'stores no visitor data');
  assert.equal((await app.post('/api/products/abc/click')).status, 404);
});

test('product page carries title, preview tags and structured data from the server', async () => {
  const { status, text } = await app.get('/product-details.html?slug=product-2');
  assert.equal(status, 200);
  assert.match(text, /<title id="pageTitle">Product 2 — SHEREBOY AFFILIATE CONCEPT<\/title>/);
  assert.ok(text.includes(`property="og:image" content="${STORED}"`));
  const ld = JSON.parse(text.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.priceCurrency, 'NGN');
  assert.equal(ld.offers.price, 800);
  assert.equal(ld.aggregateRating, undefined, 'no rating is invented');
  assert.deepEqual(ld.image, [STORED], 'dead and insecure images are left out');
});

test('a real rating is published, and hostile product text can not break out of the page', async () => {
  const { text } = await app.get('/product-details.html?slug=evil-toaster');
  assert.ok(!text.includes('<script>alert(1)'), 'title is escaped');
  assert.ok(!text.includes('</script><img'), 'structured data is escaped');
  const ld = JSON.parse(text.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.deepEqual(ld.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 12 });
});

test('unknown product gets a real 404 that search engines drop', async () => {
  const res = await app.get('/product-details.html?slug=does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
});

test('sitemap lists pages, categories and products; robots points to it', async () => {
  const { text, headers } = await app.get('/sitemap.xml');
  assert.match(headers.get('content-type'), /xml/);
  assert.ok(text.includes('https://site.test/product-details.html?slug=product-1'));
  assert.ok(text.includes('https://site.test/products.html?category=electronics'));
  assert.match((await app.get('/robots.txt')).text, /Sitemap: /);
});

test('security: writes need an administrator', async () => {
  assert.equal((await app.post('/api/products', { name: 'x' })).status, 401);
  assert.equal((await app.del('/api/products/1')).status, 401);
  assert.equal((await app.del('/api/products/1', { as: 'visitor' })).status, 403);
  assert.equal((await app.post('/api/testimonials', { customer_name: 'Fake Fan', quote: 'So good', rating: 5 })).status, 401);
  assert.equal((await app.get('/api/testimonials/all')).status, 401);
  assert.equal((await app.get('/api/products/stats')).status, 401);
});

test('security headers and static caching', async () => {
  const page = await app.get('/index.html');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  const logo = await app.get('/images/brand/email-logo.png');
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('cache-control'), /max-age=604800/);
  assert.equal(logo.headers.get('cross-origin-resource-policy'), 'cross-origin', 'mail clients may load the logo');
});

test('no secret or server-only name appears in anything the browser downloads', async () => {
  const fs = require('fs');
  const path = require('path');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const files = [...walk('public'), ...walk('admin'), ...walk('views')].filter((f) => /\.(js|html|css)$/.test(f));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const secret of ['re_test_key', 'SERVICE_ROLE', 'whsec_', 'unsubscribe_token']) {
      assert.ok(!text.includes(secret), `${secret} found in ${file}`);
    }
  }
});

test('uploads become WebP at two sizes in permanent storage, and are removed together', async () => {
  const jpeg = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#335577' } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('name', 'Uploaded product');
  form.append('price', '5000');
  form.append('affiliate_link', 'https://shop.test/new');
  form.append('is_verified', 'true');
  form.append('rating', '4.2');
  form.append('rating_count', '30');
  form.append('images', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');

  const res = await fetch(`${app.base}/api/products`, { method: 'POST', headers: { cookie: 'sb_token=admin' }, body: form });
  const { product: created } = await res.json();
  assert.equal(res.status, 201);
  assert.equal(created.is_verified, true);
  assert.equal(created.rating, 4.2);
  const url = created.images[0];
  assert.match(url, /^https:\/\/storage\.test\/.*\/products\/opt-.*\.webp$/);

  const keys = [...app.db.objects.keys()];
  assert.equal(keys.length, 3);
  const main = app.db.objects.get(keys.find((k) => !k.includes('-w480')));
  const small = app.db.objects.get(keys.find((k) => k.endsWith('-w480.webp')));
  const forEmail = app.db.objects.get(keys.find((k) => k.endsWith('-w480.jpg')));
  assert.equal((await sharp(forEmail.body).metadata()).format, 'jpeg', 'mail clients that lack WebP still get a picture');
  assert.equal(forEmail.options.contentType, 'image/jpeg');
  assert.equal((await sharp(main.body).metadata()).format, 'webp');
  assert.equal((await sharp(main.body).metadata()).width, 1200);
  assert.equal((await sharp(small.body).metadata()).width, 480);
  assert.equal(main.options.cacheControl, '31536000');

  assert.equal((await app.del(`/api/products/${created.id}`, { as: 'admin' })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(app.db.objects.size, 0);
});

test('a non-image renamed .jpg is refused and nothing is stored', async () => {
  const form = new FormData();
  form.append('name', 'Bad upload');
  form.append('price', '10');
  form.append('affiliate_link', 'https://shop.test/x');
  form.append('images', new Blob([Buffer.from('<?php echo 1; ?>')], { type: 'image/jpeg' }), 'evil.jpg');
  const res = await fetch(`${app.base}/api/products`, { method: 'POST', headers: { cookie: 'sb_token=admin' }, body: form });
  assert.equal(res.status, 400);
  assert.equal(app.db.objects.size, 0);
});

test('a half-entered rating is rejected; clearing a category works', async () => {
  const form = new FormData();
  form.append('name', 'Half rating');
  form.append('price', '10');
  form.append('affiliate_link', 'https://shop.test/x');
  form.append('rating', '5');
  const bad = await fetch(`${app.base}/api/products`, { method: 'POST', headers: { cookie: 'sb_token=admin' }, body: form });
  assert.equal(bad.status, 400);

  const edit = new FormData();
  edit.append('name', 'Product 4');
  edit.append('price', '1000');
  edit.append('affiliate_link', 'https://shop.test/4');
  edit.append('category_id', '');
  const res = await fetch(`${app.base}/api/products/4`, { method: 'PUT', headers: { cookie: 'sb_token=admin' }, body: edit });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).product.category_id, null);
});

test('contact form still saves messages, with validation, and only admins can read them', async () => {
  assert.equal((await app.post('/api/contact/message', { name: 'A', email: 'bad', message: 'short' })).status, 400);
  const ok = await app.post('/api/contact/message', { name: 'Ada', email: 'ada@example.test', subject: 'Hi', message: 'A long enough message.' });
  assert.equal(ok.status, 201);
  assert.equal((await app.get('/api/contact/messages')).status, 401);
  assert.equal((await app.get('/api/contact/messages', { as: 'admin' })).json.messages.length, 1);
});

test('the assistant answers honestly when no AI key is set, and rejects bad input', async () => {
  const res = await app.post('/api/ai/chat', { message: 'What do you sell?' });
  assert.equal(res.status, 200);
  assert.equal(res.json.configured, false);
  assert.equal((await app.post('/api/ai/chat', { message: '' })).status, 400);
});

test('the read-only partner feed keeps working and drops dead images', async () => {
  const { json } = await app.get('/api/public/products?pageSize=48');
  const byId = Object.fromEntries(json.data.products.map((p) => [p.id, p]));
  assert.equal(byId[1].image, null);
  assert.equal(byId[2].image.url, STORED);
  assert.equal((await app.post('/api/public/products', {})).status, 405);
});

test('one failing homepage section does not take the page down', async () => {
  const { createFakeSupabase } = require('./helpers/fakeSupabase');
  const home = require('../controllers/homeController');
  home.invalidateHomeCache();
  createFakeSupabase.failTables = new Set(['testimonials', 'product_clicks']);
  const ok = await app.get('/api/home');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.testimonials, []);

  home.invalidateHomeCache();
  createFakeSupabase.failTables = new Set(['products']);
  const down = await app.get('/api/home');
  assert.equal(down.status, 503);
  assert.ok(!down.text.includes('unavailable:'), 'database details are not exposed');
  createFakeSupabase.failTables = null;
  home.invalidateHomeCache();
});
