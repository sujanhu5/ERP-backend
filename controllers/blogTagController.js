const BlogTagModel = require('../models/blogTagModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const tags = await BlogTagModel.findAll();
  res.json({ success: true, data: tags });
});

const remove = asyncHandler(async (req, res) => {
  await BlogTagModel.remove(req.params.id);
  res.json({ success: true, message: 'Tag deleted.' });
});

module.exports = { list, remove };
