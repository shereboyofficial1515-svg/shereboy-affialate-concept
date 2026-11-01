// middleware/validate.js
// Lightweight, dependency-free-ish validation helpers used by the routes.
// Keeps controllers focused on logic instead of manual field checking.

const validator = require('validator');

const VALID_AVAILABILITY = ['in_stock', 'out_of_stock', 'limited'];
const LINK_RULES = { require_protocol: true, protocols: ['http', 'https'] };
const isText = (v, max) => typeof v === 'string' && v.length <= max;

function validateProduct(req, res, next) {
  const { name, price, affiliate_link, discount_percent, availability } = req.body;
  const errors = [];

  if (!isText(name, 200) || name.trim().length < 3) errors.push('Product name must be 3-200 characters.');
  if (req.body.description !== undefined && !isText(req.body.description, 10000)) errors.push('Description is too long.');
  if (price === undefined || !Number.isFinite(Number(price)) || Number(price) < 0) errors.push('Price must be a valid positive number.');
  if (!isText(affiliate_link, 2000) || !validator.isURL(affiliate_link, LINK_RULES)) {
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
  const { name, email, subject, message } = req.body;
  const errors = [];

  if (!isText(name, 150) || name.trim().length < 2) errors.push('Please enter your name.');
  if (!isText(email, 254) || !validator.isEmail(email)) errors.push('Please enter a valid email address.');
  if (subject !== undefined && subject !== null && !isText(subject, 200)) errors.push('Subject is too long.');
  if (!isText(message, 5000) || message.trim().length < 10) errors.push('Message must be 10-5,000 characters.');

  if (errors.length) return res.status(400).json({ success: false, errors });
  next();
}

function validateSubscriber(req, res, next) {
  const { email } = req.body;
  if (!isText(email, 254) || !validator.isEmail(email)) {
    return res.status(400).json({ success: false, errors: ['Please enter a valid email address.'] });
  }
  next();
}

function validateAuth(req, res, next) {
  const { email, password } = req.body;
  const errors = [];
  if (!isText(email, 254) || !validator.isEmail(email)) errors.push('Please enter a valid email address.');
  if (!isText(password, 200) || password.length < 6) errors.push('Password must be at least 6 characters.');
  if (errors.length) return res.status(400).json({ success: false, errors });
  next();
}

module.exports = { validateProduct, validateContact, validateSubscriber, validateAuth };
