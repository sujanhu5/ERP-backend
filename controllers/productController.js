const ProductModel = require('../models/productModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

/**
 * @route GET /api/products?page=1&limit=10&search=&categoryId=&lowStockOnly=
 */
const getProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { rows, total } = await ProductModel.findAll(req.user.organizationId, {
    limit, offset, search: req.query.search, categoryId: req.query.categoryId,
    lowStockOnly: req.query.lowStockOnly,
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await ProductModel.findById(req.params.id, req.user.organizationId);
  if (!product) throw new ApiError(404, 'Product not found.');
  res.json({ success: true, data: product });
});

/**
 * @route POST /api/products (Admin, Manager)
 */
const createProduct = asyncHandler(async (req, res) => {
  const existing = await ProductModel.findBySku(req.body.sku, req.user.organizationId);
  if (existing) throw new ApiError(409, 'A product with this SKU already exists.');

  const imageUrl = req.uploadedUrl || (req.file ? `/uploads/${req.user.organizationId}/${req.file.filename}` : req.body.imageUrl);
  const product = await ProductModel.create(req.user.organizationId, { ...req.body, imageUrl });

  await logAudit(req.user.id, 'CREATE_PRODUCT', 'products', product.id, { name: product.name }, null, req.user.organizationId);
  res.status(201).json({ success: true, data: product });
});

/**
 * @route PUT /api/products/:id (Admin, Manager)
 */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await ProductModel.findById(req.params.id, req.user.organizationId);
  if (!product) throw new ApiError(404, 'Product not found.');

  const imageUrl = req.uploadedUrl || (req.file ? `/uploads/${req.user.organizationId}/${req.file.filename}` : undefined);
  const fields = { ...req.body };
  if (imageUrl) fields.imageUrl = imageUrl;

  const updated = await ProductModel.update(req.params.id, fields, req.user.organizationId);
  await logAudit(req.user.id, 'UPDATE_PRODUCT', 'products', product.id, fields, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

/**
 * @route DELETE /api/products/:id (Admin only)
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await ProductModel.findById(req.params.id, req.user.organizationId);
  if (!product) throw new ApiError(404, 'Product not found.');

  await ProductModel.softDelete(req.params.id, req.user.organizationId);
  await logAudit(req.user.id, 'DELETE_PRODUCT', 'products', product.id, { name: product.name }, null, req.user.organizationId);
  res.json({ success: true, message: 'Product deleted successfully.' });
});

const getLowStock = asyncHandler(async (req, res) => {
  const products = await ProductModel.lowStock(req.user.organizationId);
  res.json({ success: true, data: products });
});

const getTopSelling = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 5;
  const products = await ProductModel.topSelling(req.user.organizationId, limit);
  res.json({ success: true, data: products });
});

module.exports = {
  getProducts, getProductById, createProduct, updateProduct,
  deleteProduct, getLowStock, getTopSelling,
};
