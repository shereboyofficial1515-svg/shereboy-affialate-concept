// public/js/animate-on-scroll.js
// Automatically applies the .reveal fade/rise animation (defined in
// animations.css) to common repeating elements across every page —
// sections, product/category cards, testimonials, FAQ items — without
// needing to hand-add a class to every single HTML file.
//
// Uses IntersectionObserver so elements only animate the first time
// they scroll into view, and does nothing if the browser doesn't
// support it (site still looks/works fine, just without the reveal).

document.addEventListener('DOMContentLoaded', () => {
    if (!('IntersectionObserver' in window)) return;

    const selectors = [
        '.section > .container > .section-head',
        '.product-card',
        '.cat-card',
        '.testi-card',
        '.faq-item',
        '.newsletter',
        '.form-card',
        '.stat-card',
        '.pd-grid > div'
    ];

    const targets = document.querySelectorAll(selectors.join(','));
    if (!targets.length) return;

    // Stagger cards within the same parent grid so they settle in one by
    // one instead of all at once.
    const indexInParent = new WeakMap();
    targets.forEach(el => {
        el.classList.add('reveal');
        const parent = el.parentElement;
        const count = indexInParent.get(parent) || 0;
        el.style.setProperty('--stagger-index', count);
        indexInParent.set(parent, count + 1);
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => observer.observe(el));
});