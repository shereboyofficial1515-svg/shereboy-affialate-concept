// controllers/categoryController.js
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const categories = await Category.all();
  res.json({ success: true, categories });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, icon, description } = req.body;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Category name is required.' });
  }
  const category = await Category.create({ name, icon, description });
  res.status(201).json({ success: true, message: 'Category created.', category });
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await Category.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Category not found.' });
  const category = await Category.update(req.params.id, {
    name: req.body.name || existing.name,
    icon: req.body.icon,
    description: req.body.description
  });
  res.json({ success: true, message: 'Category updated.', category });
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await Category.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Category not found.' });
  await Category.remove(req.params.id);
  res.json({ success: true, message: 'Category deleted.' });
});
