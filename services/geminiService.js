// services/geminiService.js
// The customer shopping assistant. Answers from the website's own catalogue and
// FAQ, through whichever provider is chosen in the AI Control Centre, following
// its instructions and knowledge base. Says so when it doesn't know something.

const Product = require('../models/Product');
const Category = require('../models/Category');
const settings = require('./settings');
const engine = require('./ai/engine');
const providers = require('./ai/providers');
const { toPlainText } = require('./richText');

const FAQ_CONTEXT = `
Q: How do affiliate links work on this website?
A: When you click "View Deal" you are taken to the retailer's site through our affiliate link. We may earn a small commission at no extra cost to you.
Q: Are the prices shown always current?
A: We update prices regularly, but the retailer's page is the final source of truth for price and availability.
Q: How do I contact support?
A: Use the Contact page, and our team replies within 1-2 business days.
`;

async function buildCatalogContext() {
  const { items } = await Product.list({ perPage: 40, sort: 'newest' });
  const categories = await Category.all();

  const catalogLines = items.map(p =>
    `- ${String(p.name).trim()} | Category: ${p.category_name || 'Uncategorized'} | Price: ₦${p.final_price} (was ₦${p.price}) | ${p.availability} | ${toPlainText(p.short_description || p.description).slice(0, 200)}`
  ).join('\n');

  const categoryLines = categories.filter(c => c.product_count > 0).map(c => `- ${c.name} (${c.product_count} products)`).join('\n');

  return `CATEGORIES:\n${categoryLines}\n\nPRODUCTS:\n${catalogLines}\n\nFAQ:\n${FAQ_CONTEXT}`;
}

async function askAssistant(userMessage, history = []) {
  const all = await settings.loadAll();
  const { source } = (await providers.keyStatus()).providers[all.ai.provider];
  if (!source) {
    return { reply: "The shopping assistant isn't available right now. Please browse our products or use the Contact page.", configured: false };
  }
  if (!all.ai.capability_assistant) {
    return { reply: "The shopping assistant is switched off right now. Please browse our products or use the Contact page.", configured: false };
  }

  const system = `You are the shopping assistant for "${all.identity.site_name}", an affiliate marketing website.
Use ONLY the catalog and FAQ context below as your source of truth about products, prices, and policies.
If you are not sure about something, or it isn't in the context, say so clearly instead of guessing.
Be concise, friendly, and helpful. When recommending products, mention the product name and price.
Never invent products, prices, or affiliate links that are not in the context.
If asked directly how the site earns money, answer honestly using the FAQ.

CONTEXT:
<product_data>
${await buildCatalogContext()}
</product_data>`;

  const result = await engine.run({
    feature: 'assistant',
    system,
    query: userMessage,
    messages: [...history.map(h => ({ role: h.role, text: h.text })), { role: 'user', text: userMessage }]
  });
  return { reply: result.text, configured: true };
}

module.exports = { askAssistant };
