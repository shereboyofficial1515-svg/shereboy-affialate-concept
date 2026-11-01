// services/email/templates.js
// Responsive HTML emails. Layout is tables with inline styles because that is
// the only thing every mail client renders reliably, and the logo is a PNG
// because Gmail and Outlook don't display SVG. All dynamic text is escaped.

const INK = '#0B2A2F';
const TEAL = '#0F766E';
const MUTED = '#5B6B70';
const LINE = '#E4E9EA';
const BG = '#F3F5F6';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const settings = require('../settings');

const site = () => settings.siteUrl();
const brand = () => settings.cached().identity.site_name;
// A logo chosen in settings gets a white header, since its JPEG copy has a white background
function headerLogo() {
  const custom = settings.cached().identity.email_logo;
  if (!custom) return { src: `${site()}/images/brand/email-logo.png`, background: INK };
  return { src: /\/opt-[^/]+\.webp$/.test(custom) ? custom.replace(/\.webp$/, '-w480.jpg') : custom, background: '#ffffff' };
}
const postalAddress = () => process.env.EMAIL_POSTAL_ADDRESS || `SHEREBOY TECH LTD, ${settings.cached().identity.address}`;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const naira = (n) => settings.formatMoney(n);
const unsubscribeUrl = (token) => `${site()}/unsubscribe.html?token=${encodeURIComponent(token)}`;
const oneClickUrl = (token) => `${site()}/api/newsletter/one-click?token=${encodeURIComponent(token)}`;
const productUrl = (p) => `${site()}/product-details.html?slug=${encodeURIComponent(p.slug)}`;

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${TEAL};">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 24px;font:600 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr></table>`;
}

function layout({ title, preheader, content, footerNote, unsubscribe }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title>
<style>@media (max-width:600px){.outer{padding:0!important}.card{border-radius:0!important}.pad{padding:24px 20px!important}.product-cell{display:block!important;width:100%!important;box-sizing:border-box}}</style>
</head><body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};"><tr><td class="outer" align="center" style="padding:28px 12px;">
  <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:${headerLogo().background};padding:22px 32px;">
      <a href="${site()}"><img src="${esc(headerLogo().src)}" height="44" alt="${esc(brand())}" style="display:block;height:44px;width:auto;border:0;color:#ffffff;font:700 16px ${FONT};"></a>
    </td></tr>
    <tr><td class="pad" style="padding:32px;font:400 15px/1.6 ${FONT};color:${INK};">${content}</td></tr>
    <tr><td class="pad" style="padding:22px 32px;border-top:1px solid ${LINE};font:400 12px/1.6 ${FONT};color:${MUTED};">
      ${footerNote ? `<p style="margin:0 0 8px;">${footerNote}</p>` : ''}
      <p style="margin:0 0 8px;">We may earn a commission when you buy through our links, at no extra cost to you. Prices can change; the retailer's page is the final word.</p>
      <p style="margin:0;"><a href="${site()}" style="color:${TEAL};">${esc(site().replace(/^https?:\/\//, ''))}</a> · ${esc(postalAddress())}${unsubscribe ? ` · <a href="${esc(unsubscribe)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>` : ''}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// Images from our upload pipeline have a JPEG copy, which every mail client can display
function emailImage(p) {
  const url = p.images && p.images[0];
  if (!url || !/^https:/.test(url)) return `${site()}/images/brand/icon-512.png`;
  return /\/opt-[^/]+\.webp$/.test(url) ? url.replace(/\.webp$/, '-w480.jpg') : url;
}

function productCell(p) {
  const hasDiscount = p.discount_percent > 0 && p.price > p.final_price;
  const image = emailImage(p);
  return `<td class="product-cell" width="50%" valign="top" style="padding:8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
      <tr><td align="center" style="background:#ffffff;padding:10px;"><a href="${esc(productUrl(p))}"><img src="${esc(image)}" width="220" alt="${esc(p.name)}" style="display:block;width:100%;max-width:220px;height:auto;border:0;"></a></td></tr>
      <tr><td style="padding:12px 14px 16px;font-family:${FONT};">
        <a href="${esc(productUrl(p))}" style="display:block;font:600 14px/1.35 ${FONT};color:${INK};text-decoration:none;margin-bottom:6px;">${esc(p.name)}</a>
        <span style="font:700 16px ${FONT};color:${INK};">${naira(p.final_price)}</span>
        ${hasDiscount ? `<span style="font:400 13px ${FONT};color:${MUTED};text-decoration:line-through;margin-left:6px;">${naira(p.price)}</span>
        <span style="font:700 12px ${FONT};color:${TEAL};margin-left:6px;">-${Math.round(p.discount_percent)}%</span>` : ''}
        <div style="margin-top:10px;"><a href="${esc(productUrl(p))}" style="font:600 13px ${FONT};color:${TEAL};text-decoration:none;">View deal →</a></div>
      </td></tr>
    </table>
  </td>`;
}

function productGrid(products) {
  if (!products || !products.length) return '';
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    rows.push(`<tr>${productCell(products[i])}${products[i + 1] ? productCell(products[i + 1]) : '<td class="product-cell" width="50%"></td>'}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px -8px 8px;width:calc(100% + 16px);">${rows.join('')}</table>`;
}

const paragraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

function productsAsText(products) {
  return (products || []).map((p) => `- ${p.name}: ${naira(p.final_price)}\n  ${productUrl(p)}`).join('\n');
}

function confirmationEmail({ confirmUrl }) {
  const subject = 'Please confirm your subscription';
  return {
    subject,
    html: layout({
      title: subject,
      preheader: 'One click and you are in. If this was not you, ignore this email.',
      content: `<h1 style="margin:0 0 12px;font:700 24px/1.25 ${FONT};color:${INK};">Confirm your subscription</h1>
        <p style="margin:0 0 20px;">Tap below to start receiving new product announcements, featured products, special deals, platform updates and weekly recommendations from ${esc(brand())}.</p>
        ${button(confirmUrl, 'Yes, subscribe me')}
        <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">The link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us again.</p>`
    }),
    text: `Confirm your subscription to ${brand()}:\n${confirmUrl}\n\nThe link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us again.\n\n${postalAddress()}`
  };
}

function welcomeEmail({ unsubscribeToken, products }) {
  const subject = `You're subscribed to ${brand()}`;
  const unsubscribe = unsubscribeUrl(unsubscribeToken);
  return {
    subject,
    html: layout({
      title: subject,
      preheader: "You're in. Here's what we're recommending right now.",
      unsubscribe,
      footerNote: "You're receiving this because you confirmed your subscription on our website.",
      content: `<h1 style="margin:0 0 12px;font:700 24px/1.25 ${FONT};color:${INK};">Welcome aboard</h1>
        <p style="margin:0 0 8px;">Your subscription is confirmed. We'll send you new products, special deals and a weekly round-up. You can leave at any time.</p>
        ${products && products.length ? `<h2 style="margin:22px 0 0;font:700 17px ${FONT};color:${INK};">Worth a look right now</h2>${productGrid(products)}` : ''}
        <div style="margin-top:18px;">${button(`${site()}/products.html`, 'Browse all products')}</div>`
    }),
    text: `Your subscription is confirmed.\n\n${productsAsText(products)}\n\nBrowse: ${site()}/products.html\n\nUnsubscribe: ${unsubscribe}\n${postalAddress()}`
  };
}

function campaignEmail({ campaign, products, unsubscribeToken }) {
  const unsubscribe = unsubscribeUrl(unsubscribeToken);
  return {
    subject: campaign.subject,
    html: layout({
      title: campaign.subject,
      preheader: campaign.preheader,
      unsubscribe,
      footerNote: "You're receiving this because you subscribed on our website.",
      content: `<h1 style="margin:0 0 14px;font:700 24px/1.25 ${FONT};color:${INK};">${esc(campaign.heading)}</h1>
        ${paragraphs(campaign.body)}
        ${productGrid(products)}
        <div style="margin-top:18px;">${button(`${site()}/products.html`, 'See all products')}</div>`
    }),
    text: `${campaign.heading}\n\n${campaign.body || ''}\n\n${productsAsText(products)}\n\nSee all products: ${site()}/products.html\n\nUnsubscribe: ${unsubscribe}\n${postalAddress()}`
  };
}

/** Headers that give the recipient a working unsubscribe button in their mail app. */
function unsubscribeHeaders(token) {
  return {
    'List-Unsubscribe': `<${oneClickUrl(token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

module.exports = { confirmationEmail, welcomeEmail, campaignEmail, unsubscribeHeaders, unsubscribeUrl, site };
