// middleware/validate.js
// Lightweight, dependency-free-ish validation helpers used by the routes.
// Keeps controllers focused on logic instead of manual field checking.

const validator = require('validator');

const VALID_AVAILABILITY = ['in_stock', 'out_of_stock', 'limited'];

function validateProduct(req, res, next) {
  const { name, price, affiliate_link, discount_percent, availability } = req.body;
  const errors = [];

  if (!name || name.trim().length < 3) errors.push('Product name must be at least 3 characters.');
  if (price === undefined || isNaN(Number(price)) || Number(price) < 0) errors.push('Price must be a valid positive number.');
  if (!affiliate_link || !validator.isURL(affiliate_link, { require_protocol: true })) {
    errors.push('Affiliate link must be a valid URL (including https://).');
  }
  if (discount_percent !== undefined && (isNaN(Number(discount_percent)) || Number(discount_percent) < 0 || Number(discount_percent) > 100)) {
    errors.push('Discount must be a number between 0 and 100.');
  }
  if (availability !== undefined && !VALID_AVAILABILITY.includes(availability)) {
    errors.push('Availability must be one of: in stock, limited, out of stock.');
  }

  if (errors.length) return res.status(400).json({ success: false, errors });
  next();
}

function validateContact(req, res, next) {
  const { name, email, message } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Please enter your name.');
  if (!email || !validator.isEmail(email)) errors.push('Please enter a valid email address.');
  if (!message || message.trim().length < 10) errors.push('Message must be at least 10 characters.');

  if (errors.length) return res.status(400).json({ success: false, errors });
  next();
}

function validateSubscriber(req, res, next) {
  const { email } = req.body;
  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ success: false, errors: ['Please enter a valid email address.'] });
  }
  next();
}

function validateAuth(req, res, next) {
  const { email, password } = req.body;
  const errors = [];
  if (!email || !validator.isEmail(email)) errors.push('Please enter a valid email address.');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters.');
  if (errors.length) return res.status(400).json({ success: false, errors });
  next();
}

module.exports = { validateProduct, validateContact, validateSubscriber, validateAuth };
