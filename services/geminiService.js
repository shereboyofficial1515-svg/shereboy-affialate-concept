// services/geminiService.js
// Wraps calls to Google's Gemini API so the AI assistant answers using
// the website's own product catalog and FAQ as its primary knowledge
// source, and is explicit whenever it doesn't know something.
//
// Model note: use "gemini-2.5-flash" (or newer). The older
// "gemini-1.5-flash" alias has been retired by Google and will fail.

const Product = require('../models/Product');
const Category = require('../models/Category');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FAQ_CONTEXT = `
Q: How do affiliate links work on SHEREBOY AFFILIATE CONCEPT?
A: When you click "Buy Now" or "View Deal" you are taken to the retailer's site through our affiliate link. We may earn a small commission at no extra cost to you.
Q: Are the prices shown always current?
A: We update prices regularly, but the retailer's page is the final source of truth for price and availability.
Q: How do I contact support?
A: Use the Contact page, and our team replies within 1-2 business days.
`;

async function buildCatalogContext() {
  const { items } = await Product.list({ perPage: 40, sort: 'newest' });
  const categories = await Category.all();

  const catalogLines = items.map(p =>
    `- ${p.name} | Category: ${p.category_name || 'Uncategorized'} | Price: ₦${p.final_price} (was ₦${p.price}) | ${p.availability} | ${p.is_deal ? 'ON DEAL' : ''} ${p.is_featured ? 'FEATURED' : ''}`
  ).join('\n');

  const categoryLines = categories.map(c => `- ${c.name} (${c.product_count} products)`).join('\n');

  return `CATEGORIES:\n${categoryLines}\n\nPRODUCTS:\n${catalogLines}\n\nFAQ:\n${FAQ_CONTEXT}`;
}

async function askAssistant(userMessage, history = []) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return {
      reply: "The AI assistant isn't configured yet. Add a valid GEMINI_API_KEY to your .env file to enable product recommendations and Q&A.",
      configured: false
    };
  }

  const systemInstruction = `You are the shopping assistant for "SHEREBOY AFFILIATE CONCEPT", an affiliate marketing website.
Use ONLY the catalog and FAQ context below as your source of truth about products, prices, and policies.
If you are not sure about something, or it isn't in the context, say so clearly instead of guessing.
Be concise, friendly, and helpful. When recommending products, mention the product name and price.
Never invent products, prices, or affiliate links that are not in the context.

CONTEXT:
${await buildCatalogContext()}`;

  const contents = [
    ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
    "I couldn't generate a response just now. Please try rephrasing your question.";

  return { reply, configured: true };
}

module.exports = { askAssistant };