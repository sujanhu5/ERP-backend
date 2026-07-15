const CategoryModel = require('../models/categoryModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const getCategories = asyncHandler(async (req, res) => {
  const categories = await CategoryModel.findAll(req.user.organizationId);
  res.json({ success: true, data: categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await CategoryModel.create(req.user.organizationId, req.body);
  res.status(201).json({ success: true, data: category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await CategoryModel.findById(req.params.id, req.user.organizationId);
  if (!category) throw new ApiError(404, 'Category not found.');
  const updated = await CategoryModel.update(req.params.id, req.body, req.user.organizationId);
  res.json({ success: true, data: updated });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await CategoryModel.findById(req.params.id, req.user.organizationId);
  if (!category) throw new ApiError(404, 'Category not found.');
  await CategoryModel.delete(req.params.id, req.user.organizationId);
  res.json({ success: true, message: 'Category deleted successfully.' });
});

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
