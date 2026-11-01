// public/js/layout.js
// Injects the shared navbar and footer into every public page from one
// place, so updating a link or the footer never means editing 11 HTML
// files by hand. Pages just need <div id="site-header"></div> and
// <div id="site-footer"></div> plus an AI widget mount point.

const NAVBAR_HTML = `
<nav class="navbar" aria-label="Main">
  <div class="nav-inner">
    <a href="/" class="brand" aria-label="SHEREBOY AFFILIATE CONCEPT home">
      <img src="/images/brand/logo-horizontal-light-bg.svg" alt="SHEREBOY AFFILIATE CONCEPT" width="214" height="42" />
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
    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="navLinks">${icon('menu')}</button>
  </div>
</nav>`;

const FOOTER_HTML = `
<footer>
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="/" aria-label="SHEREBOY AFFILIATE CONCEPT home">
          <img src="/images/brand/logo-horizontal-dark-bg.svg" alt="SHEREBOY AFFILIATE CONCEPT" width="225" height="44" loading="lazy" />
        </a>
        <p class="footer-about">Hand-picked products from online retailers, with honest prices and clear disclosure. A SHEREBOY TECH LTD project.</p>
        <div class="footer-social">
          <a href="https://tiktok.com/@shereboy" target="_blank" rel="noopener" aria-label="TikTok">${icon('tiktok')}</a>
          <a href="https://youtube.com/@shereboy1379" target="_blank" rel="noopener" aria-label="YouTube">${icon('youtube')}</a>
          <a href="https://wa.me/2347055426419" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>
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
        <a class="footer-link" href="/privacy.html">Privacy Policy</a>
        <a class="footer-link" href="/terms.html">Terms &amp; Conditions</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span class="footer-year"></span> SHEREBOY AFFILIATE CONCEPT. All rights reserved.</span>
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
  if (header) header.innerHTML = NAVBAR_HTML;
  if (footer) footer.innerHTML = FOOTER_HTML;
  if (aiMount) aiMount.innerHTML = AI_WIDGET_HTML;

  document.querySelectorAll('[data-newsletter]').forEach((el) => { el.innerHTML = newsletterFormHTML(el.dataset.newsletter); });

  // Static markup can ask for an icon by name
  document.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.classList.contains('icon')) el.innerHTML = ICONS[el.dataset.icon] || '';
    else el.innerHTML = icon(el.dataset.icon);
  });

  // Re-run nav behaviors now that the navbar exists in the DOM.
  document.dispatchEvent(new Event('layout:ready'));
});
