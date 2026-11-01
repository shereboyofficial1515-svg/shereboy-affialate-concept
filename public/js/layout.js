// public/js/layout.js
// Injects the shared navbar and footer into every public page from one
// place, so updating a link or the footer never means editing 11 HTML
// files by hand. Pages just need <div id="site-header"></div> and
// <div id="site-footer"></div> plus an AI widget mount point.

const SITE_CONFIG = window.SITE || { name: 'SHEREBOY AFFILIATE CONCEPT', description: 'Hand-picked products from online retailers, with honest prices and clear disclosure. A SHEREBOY TECH LTD project.', social: { tiktok: 'https://tiktok.com/@shereboy', youtube: 'https://youtube.com/@shereboy1379', whatsapp: 'https://wa.me/2347055426419' }, legalLinks: [{ href: '/privacy.html', title: 'Privacy Policy' }, { href: '/terms.html', title: 'Terms & Conditions' }], theme: {}, newsletterEnabled: true };
const SITE_NAME = escapeHtml(SITE_CONFIG.name);
const SOCIAL_LABELS = { tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };

// The built-in logo has a version for each background; a custom logo is used as it is
function headerLogoSrc() {
  if (SITE_CONFIG.logo) return SITE_CONFIG.logo;
  return document.documentElement.getAttribute('data-theme') === 'dark' ? '/images/brand/logo-horizontal-dark-bg.svg' : '/images/brand/logo-horizontal-light-bg.svg';
}

const NAVBAR_HTML = `
<nav class="navbar" aria-label="Main">
  <div class="nav-inner">
    <a href="/" class="brand" aria-label="${SITE_NAME} home">
      <img id="headerLogo" src="${escapeHtml(headerLogoSrc())}" alt="${SITE_NAME}" />
    </a>
    <ul class="nav-links" id="navLinks">
      <li><a href="/">Home</a></li>
      <li><a href="/products.html">Products</a></li>
      <li><a href="/categories.html">Categories</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/faq.html">FAQ</a></li>
      <li><a href="/contact.html">Contact</a></li>
    </ul>
    <form class="nav-search" role="search" action="/products.html">
      ${icon('search')}
      <label class="visually-hidden" for="navSearchInput">Search products</label>
      <input type="search" id="navSearchInput" name="q" placeholder="Search products" autocomplete="off" />
    </form>
    ${SITE_CONFIG.theme.allowToggle ? `<button class="theme-toggle" id="themeToggle" aria-label="Switch between light and dark">${icon('sparkle')}</button>` : ''}
    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="navLinks">${icon('menu')}</button>
  </div>
</nav>`;

const FOOTER_HTML = `
<footer>
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="/" aria-label="${SITE_NAME} home">
          <img src="${escapeHtml(SITE_CONFIG.logoAlt || '/images/brand/logo-horizontal-dark-bg.svg')}" alt="${SITE_NAME}" loading="lazy" />
        </a>
        <p class="footer-about">${escapeHtml(SITE_CONFIG.description)}</p>
        <div class="footer-social">
          ${Object.entries(SITE_CONFIG.social).filter(([, url]) => url).map(([name, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${SOCIAL_LABELS[name]}">${icon(ICONS[name] ? name : 'external-link')}</a>`).join('')}
        </div>
      </div>
      <div>
        <h4>Shop</h4>
        <a class="footer-link" href="/products.html">All Products</a>
        <a class="footer-link" href="/products.html?deal=true">Today's Deals</a>
        <a class="footer-link" href="/products.html?featured=true">Featured</a>
        <a class="footer-link" href="/categories.html">Categories</a>
      </div>
      <div>
        <h4>Company</h4>
        <a class="footer-link" href="/about.html">About Us</a>
        <a class="footer-link" href="/contact.html">Contact</a>
        <a class="footer-link" href="/faq.html">FAQ</a>
      </div>
      <div>
        <h4>Legal</h4>
        ${SITE_CONFIG.legalLinks.map((l) => `<a class="footer-link" href="${escapeHtml(l.href)}">${escapeHtml(l.title)}</a>`).join('')}
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span class="footer-year"></span> ${SITE_NAME}. All rights reserved.</span>
      <span>As an affiliate, we may earn a commission from qualifying purchases.</span>
    </div>
  </div>
</footer>`;

const AI_WIDGET_HTML = `
<button class="ai-fab" id="aiFab" aria-label="Open shopping assistant">${icon('chat')}</button>
<div class="ai-panel" id="aiPanel" role="dialog" aria-label="Shopping assistant">
  <div class="ai-head">
    <div class="ai-head-title">${icon('sparkle')} Deal Assistant</div>
    <button id="aiClose" aria-label="Close">${icon('close')}</button>
  </div>
  <div class="ai-body" id="aiBody">
    <div class="ai-msg bot">Hi! I'm your shopping assistant. Ask me about products, prices, or which deal fits your budget.</div>
  </div>
  <div class="ai-typing" id="aiTyping" style="display:none;">Assistant is typing…</div>
  <form class="ai-input-row" id="aiForm">
    <input type="text" id="aiInput" placeholder="Ask about a product…" autocomplete="off" aria-label="Your question" required />
    <button type="submit" class="ai-send" aria-label="Send">${icon('send')}</button>
  </form>
</div>`;

// The subscribe form, used in the homepage section. Consent wording sits right
// next to the button, and the hidden field catches form-filling bots.
function newsletterFormHTML(source) {
  return `
  <form class="newsletter-form" data-source="${source}" novalidate>
    <div class="subscribe-row">
      <label class="visually-hidden" for="nl-${source}">Email address</label>
      <input type="email" id="nl-${source}" name="email" placeholder="you@email.com" autocomplete="email" required />
      <button class="btn btn-on-dark" type="submit">Subscribe</button>
    </div>
    <div class="hp-field" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
    <p class="consent">We'll email you a link to confirm. By subscribing you agree to receive these emails. Unsubscribe in one click at any time. See our <a href="/privacy.html">Privacy Policy</a>.</p>
  </form>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  const aiMount = document.getElementById('ai-widget');
  const promo = SITE_CONFIG.promo;
  const promoHtml = promo ? (promo.link
    ? `<a class="promo-bar" href="${escapeHtml(promo.link)}">${escapeHtml(promo.message)}</a>`
    : `<div class="promo-bar">${escapeHtml(promo.message)}</div>`) : '';
  if (header) header.innerHTML = promoHtml + NAVBAR_HTML;
  if (!SITE_CONFIG.newsletterEnabled) document.querySelectorAll('[data-newsletter]').forEach((el) => { (el.closest('section') || el).hidden = true; });
  document.querySelectorAll('[data-site-phone]').forEach((el) => {
    if (!SITE_CONFIG.phone) { el.closest('[data-site-phone-row]')?.remove(); return; }
    el.textContent = SITE_CONFIG.phone;
  });
  if (footer) footer.innerHTML = FOOTER_HTML;
  if (aiMount) aiMount.innerHTML = AI_WIDGET_HTML;

  document.querySelectorAll('[data-newsletter]').forEach((el) => { el.innerHTML = newsletterFormHTML(el.dataset.newsletter); });

  // Static markup can ask for an icon by name
  document.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.classList.contains('icon')) el.innerHTML = ICONS[el.dataset.icon] || '';
    else el.innerHTML = icon(el.dataset.icon);
  });

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* the choice just isn't remembered */ }
      document.getElementById('headerLogo').src = headerLogoSrc();
    });
  }

  // Re-run nav behaviors now that the navbar exists in the DOM.
  document.dispatchEvent(new Event('layout:ready'));
});
