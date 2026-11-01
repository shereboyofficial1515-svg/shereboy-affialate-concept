#!/usr/bin/env node
// scripts/recover-product-images.js
// Restores images for products whose "/uploads/..." files were wiped by the host.
// For each such product it follows the product's own affiliate link, reads the
// image the retailer publishes for that exact listing (og:image), and stores a
// permanent copy in Supabase Storage. It never substitutes any other picture:
// a product whose listing can't be read, or whose title doesn't match, is left
// unchanged and reported.
//
//   node scripts/recover-product-images.js                preview only, changes nothing
//   node scripts/recover-product-images.js --apply        store images and update products
//   node scripts/recover-product-images.js --ids=12,11    limit to these products
//
// --apply first writes the current image values to backups/ so it can be undone.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase');
const { storeImageBuffer, usableImages } = require('../services/imageStorage');

const APPLY = process.argv.includes('--apply');
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const ONLY_IDS = idsArg ? idsArg.slice(6).split(',').map(Number) : null;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const MIN_TITLE_MATCH = 0.5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2));

/** Share of the product name's words that appear in the listing's title. */
function titleMatch(name, title) {
  const wanted = words(name);
  if (!wanted.size) return 0;
  const found = words(title);
  return [...wanted].filter((w) => found.has(w)).length / wanted.size;
}

function metaContent(html, property) {
  const tag = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]*>`, 'i'));
  const value = tag && tag[0].match(/content=["']([^"']+)["']/i);
  return value ? decodeEntities(value[1]) : null;
}

async function readListing(link) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(link, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html', 'accept-language': 'en' }
      });
      if (!res.ok) throw new Error(`listing returned HTTP ${res.status}`);
      const html = await res.text();
      const image = metaContent(html, 'og:image');
      const title = metaContent(html, 'og:title');
      if (!image || !title) throw new Error('listing page has no og:image/og:title');
      return { image, title, url: res.url.split('?')[0] };
    } catch (err) {
      lastError = err;
      if (attempt < 6) await sleep(3000 * attempt);
    }
  }
  throw lastError;
}

async function downloadImage(url) {
  if (new URL(url).protocol !== 'https:') throw new Error('image is not https');
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`image returned HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('image is too large');
  return buffer;
}

(async () => {
  const { data: products, error } = await supabaseAdmin
    .from('products').select('id, name, images, affiliate_link').order('id', { ascending: false });
  if (error) throw new Error(error.message);

  const targets = products.filter((p) => !usableImages(p.images).length && (!ONLY_IDS || ONLY_IDS.includes(p.id)));
  console.log(`${products.length} products, ${targets.length} without a usable image. Mode: ${APPLY ? 'APPLY' : 'preview (nothing will change)'}\n`);
  if (!targets.length) return;

  if (APPLY) {
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `product-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(targets.map(({ id, name, images }) => ({ id, name, images })), null, 2));
    console.log(`Backup of the current values: ${file}\n`);
  }

  const summary = { recovered: 0, skipped: [] };
  for (const product of targets) {
    const label = `#${product.id} ${product.name.trim()}`;
    try {
      const listing = await readListing(product.affiliate_link);
      const match = titleMatch(product.name, listing.title);
      if (match < MIN_TITLE_MATCH) throw new Error(`listing title doesn't match (${Math.round(match * 100)}%): "${listing.title}"`);
      const buffer = await downloadImage(listing.image);
      if (APPLY) {
        const url = await storeImageBuffer(buffer);
        const { error: updateError } = await supabaseAdmin.from('products').update({ images: [url] }).eq('id', product.id);
        if (updateError) throw new Error(updateError.message);
        console.log(`RESTORED ${label}\n   ${url}`);
      } else {
        console.log(`WOULD RESTORE ${label}\n   title match ${Math.round(match * 100)}%: ${listing.title}\n   ${listing.image} (${Math.round(buffer.length / 1024)} KB)`);
      }
      summary.recovered++;
    } catch (err) {
      console.log(`SKIPPED ${label}\n   ${err.message}`);
      summary.skipped.push(label);
    }
    await sleep(1500); // one at a time, gently
  }

  console.log(`\n${APPLY ? 'Restored' : 'Can restore'}: ${summary.recovered}. Skipped: ${summary.skipped.length}.`);
  if (summary.skipped.length) console.log('Upload these from Admin → Products:\n  ' + summary.skipped.join('\n  '));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
