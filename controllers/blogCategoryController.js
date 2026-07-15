const BlogCategoryModel = require('../models/blogCategoryModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const categories = await BlogCategoryModel.findAll();
  res.json({ success: true, data: categories });
});

const create = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Category name is required.');
  const category = await BlogCategoryModel.create({ name, description, color });
  res.status(201).json({ success: true, data: category });
});

const update = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body;
  const category = await BlogCategoryModel.update(req.params.id, { name, description, color });
  if (!category) throw new ApiError(404, 'Category not found.');
  res.json({ success: true, data: category });
});

const remove = asyncHandler(async (req, res) => {
  const existing = await BlogCategoryModel.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Category not found.');
  await BlogCategoryModel.remove(req.params.id);
  res.json({ success: true, message: 'Category deleted.' });
});

module.exports = { list, create, update, remove };
