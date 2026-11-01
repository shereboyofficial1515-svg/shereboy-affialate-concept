// services/homeSections.js
// The homepage sections an administrator can reorder or switch off. Each key
// matches a section-<key> element in public/index.html.

const BRAND_DEFAULT_SECTIONS = [
  { key: 'categories', label: 'Categories', enabled: true },
  { key: 'featured', label: 'Featured products', enabled: true },
  { key: 'deals', label: "Today's best deals", enabled: true },
  { key: 'trending', label: 'Trending products', enabled: true },
  { key: 'recent', label: 'Recently added', enabled: true },
  { key: 'recommended', label: 'Biggest savings', enabled: true },
  { key: 'testimonials', label: 'Testimonials', enabled: true },
  { key: 'faq', label: 'Quick answers', enabled: true },
  { key: 'newsletter', label: 'Newsletter signup', enabled: true }
];

module.exports = { BRAND_DEFAULT_SECTIONS };
