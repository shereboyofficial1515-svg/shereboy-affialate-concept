// public/js/faq-page.js
const FAQS = [
  { q: 'How do affiliate links work on this site?', a: 'When you click "Buy Now" or "View Deal," you\'re taken to the retailer\'s site through our affiliate link. We may earn a small commission on qualifying purchases — at no extra cost to you.' },
  { q: 'Are the prices shown always accurate?', a: 'We update prices regularly, but the retailer\'s page is the final source of truth for price and availability at checkout.' },
  { q: 'Do you sell products directly?', a: 'No — we don\'t handle payments, shipping, or returns. All purchases happen on the retailer\'s website after you click through.' },
  { q: 'How does the AI shopping assistant work?', a: 'The assistant (powered by Google Gemini) answers questions using our own product catalog and FAQ as its source of truth. If it doesn\'t know something, it will tell you rather than guess.' },
  { q: 'How do I know if a deal is genuine?', a: 'We manually review every product before listing it, and only use the "Deal" badge when there\'s a real, verifiable discount.' },
  { q: 'Can I suggest a product to be added?', a: 'Yes! Use the Contact page to send a suggestion — we review submissions regularly.' },
  { q: 'How do I reach customer support?', a: 'The fastest way is WhatsApp at 2347055426419, or the Contact form — we reply within 1-2 business days.' },
  { q: 'Is my personal information safe?', a: 'Yes. We only collect what\'s needed to respond to you (name, email, message) and never sell your data. See our Privacy Policy for details.' }
];

document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('faqList');
  wrap.innerHTML = FAQS.map((f, i) => `
<div class="faq-item${i === 0 ? ' open' : ''}">
  <div class="faq-q" role="button" tabindex="0" aria-expanded="${i === 0 ? 'true' : 'false'}">${f.q} ${icon('chevron', 'chev')}</div>
  <div class="faq-a"><p>${f.a}</p></div>
</div>`).join('');
  wrap.querySelectorAll('.faq-q').forEach(q => {
    const toggle = () => {
      const isOpen = q.parentElement.classList.toggle('open');
      q.setAttribute('aria-expanded', String(isOpen));
    };
    q.addEventListener('click', toggle);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
});
