// public/js/layout.js
// Injects the shared navbar and footer into every public page from one
// place, so updating a link or the footer never means editing 11 HTML
// files by hand. Pages just need <div id="site-header"></div> and
// <div id="site-footer"></div> plus an AI widget mount point.

const NAVBAR_HTML = `
<nav class="navbar">
  <div class="nav-inner">
    <a href="/index.html" class="brand">
      <span class="brand-mark">S</span> SHEREBOY <span style="color:#D4A954">Affiliate</span>
    </a>
    <ul class="nav-links">
      <li><a href="/index.html">Home</a></li>
      <li><a href="/products.html">Products</a></li>
      <li><a href="/categories.html">Categories</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/faq.html">FAQ</a></li>
      <li><a href="/contact.html">Contact</a></li>
    </ul>
    <div class="nav-cta">
      <a href="/products.html" class="btn btn-gold btn-sm">Shop Deals</a>
      <button class="nav-toggle" aria-label="Toggle menu">☰</button>
    </div>
  </div>
</nav>`;

const FOOTER_HTML = `
<footer>
  <div class="container">
    <div class="footer-grid">
      <div>
        <a href="/index.html" class="brand" style="margin-bottom:14px;">
          <span class="brand-mark">S</span> SHEREBOY <span style="color:#D4A954">Affiliate</span>
        </a>
        <p style="font-size:0.85rem; max-width:280px; margin-top:10px;">
          Curated deals across electronics, home, fashion, beauty, and phone accessories —
          picked, tested by eye, and explained honestly before you click "buy."
        </p>
        <div class="footer-social">
          <a href="https://tiktok.com/@shereboy" target="_blank" rel="noopener" aria-label="TikTok">TT</a>
          <a href="https://youtube.com/@shereboy1379" target="_blank" rel="noopener" aria-label="YouTube">YT</a>
          <a href="https://wa.me/2347055426419" target="_blank" rel="noopener" aria-label="WhatsApp">WA</a>
        </div>
      </div>
      <div>
        <h4>Shop</h4>
        <a href="/products.html">All Products</a>
        <a href="/products.html?deal=true">Today's Deals</a>
        <a href="/categories.html">Categories</a>
      </div>
      <div>
        <h4>Company</h4>
        <a href="/about.html">About Us</a>
        <a href="/contact.html">Contact</a>
        <a href="/faq.html">FAQ</a>
      </div>
      <div>
      <h4>Legal</h4>
      <a href="/privacy.html">Privacy Policy</a>
      <a href="/terms.html">Terms &amp; Conditions</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span class="footer-year"></span> SHEREBOY AFFILIATE CONCEPT — a SHEREBOY TECH LTD project.</span>
      <span>As an affiliate, we may earn a commission from qualifying purchases.</span>
    </div>
  </div>
</footer>`;

const AI_WIDGET_HTML = `
<button class="ai-fab" id="aiFab" aria-label="Open shopping assistant">💬</button>
<div class="ai-panel" id="aiPanel">
  <div class="ai-head">
    <div class="ai-head-title">🤖 Deal Assistant</div>
    <button id="aiClose" style="color:#fff;font-size:1.1rem;" aria-label="Close">✕</button>
  </div>
  <div class="ai-body" id="aiBody">
    <div class="ai-msg bot">Hi! I'm your shopping assistant. Ask me about products, prices, or which deal fits your budget.</div>
  </div>
  <div class="ai-typing" id="aiTyping" style="display:none;">Assistant is typing…</div>
  <form class="ai-input-row" id="aiForm">
    <input type="text" id="aiInput" placeholder="Ask about a product…" autocomplete="off" required />
    <button type="submit" class="ai-send" aria-label="Send">➤</button>
  </form>
</div>`;

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  const aiMount = document.getElementById('ai-widget');
  if (header) header.innerHTML = NAVBAR_HTML;
  if (footer) footer.innerHTML = FOOTER_HTML;
  if (aiMount) aiMount.innerHTML = AI_WIDGET_HTML;

  // Re-run nav behaviors now that the navbar exists in the DOM.
  document.dispatchEvent(new Event('layout:ready'));
});
