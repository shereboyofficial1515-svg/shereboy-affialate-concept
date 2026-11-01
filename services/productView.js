// services/productView.js
// What visitors, emails and the dashboard are told about a product's images.
// The raw column can hold dead paths from the old disk uploads; `images` here
// only lists ones a browser can load, and `images_missing` flags products that
// have nothing to show so the dashboard can point them out.

const { usableImages } = require('./imageStorage');

function publicProduct(product) {
  const images = usableImages(product.images);
  // Unpublished edits are never sent to visitors
  const { draft, draft_saved_at: savedAt, ...visible } = product;
  return { ...visible, images, images_missing: images.length === 0 };
}

/** Listing cards don't need the long text: keeps the homepage payload small. */
function cardProduct(product) {
  const { description, specifications, draft, draft_saved_at: savedAt, ...card } = publicProduct(product);
  return card;
}

module.exports = { publicProduct, cardProduct };
