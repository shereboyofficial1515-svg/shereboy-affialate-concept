// controllers/categoryController.js
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { notifyPartners } = require('../services/partnerWebhook');

exports.list = asyncHandler(async (req, res) => {
  const categories = await Category.all();
  res.json({ success: true, categories });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, icon, description } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
    return res.status(400).json({ success: false, message: 'Category name is required.' });
  }
  const category = await Category.create({ name, icon, description });
  res.status(201).json({ success: true, message: 'Category created.', category });
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await Category.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Category not found.' });
  if (req.body.name !== undefined && (typeof req.body.name !== 'string' || req.body.name.trim().length < 2 || req.body.name.length > 100)) {
    return res.status(400).json({ success: false, message: 'Category name is required.' });
  }
  const category = await Category.update(req.params.id, {
    name: req.body.name || existing.name,
    icon: req.body.icon,
    description: req.body.description
  });
  notifyPartners('category.updated', category);
  res.json({ success: true, message: 'Category updated.', category });
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await Category.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Category not found.' });
  await Category.remove(req.params.id);
  notifyPartners('category.deleted', existing);
  res.json({ success: true, message: 'Category deleted.' });
});
