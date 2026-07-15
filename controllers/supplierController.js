const SupplierModel = require('../models/supplierModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const getSuppliers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { rows, total } = await SupplierModel.findAll(req.user.organizationId, { limit, offset, search: req.query.search });
  res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const getSupplierById = asyncHandler(async (req, res) => {
  const supplier = await SupplierModel.findById(req.params.id, req.user.organizationId);
  if (!supplier) throw new ApiError(404, 'Supplier not found.');
  const products = await SupplierModel.productsSupplied(req.params.id, req.user.organizationId);
  res.json({ success: true, data: { ...supplier, productsSupplied: products } });
});

const createSupplier = asyncHandler(async (req, res) => {
  const supplier = await SupplierModel.create(req.user.organizationId, req.body);
  await logAudit(req.user.id, 'CREATE_SUPPLIER', 'suppliers', supplier.id, { companyName: supplier.company_name }, null, req.user.organizationId);
  res.status(201).json({ success: true, data: supplier });
});

const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await SupplierModel.findById(req.params.id, req.user.organizationId);
  if (!supplier) throw new ApiError(404, 'Supplier not found.');
  const updated = await SupplierModel.update(req.params.id, req.body, req.user.organizationId);
  await logAudit(req.user.id, 'UPDATE_SUPPLIER', 'suppliers', supplier.id, req.body, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

const deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await SupplierModel.findById(req.params.id, req.user.organizationId);
  if (!supplier) throw new ApiError(404, 'Supplier not found.');
  await SupplierModel.softDelete(req.params.id, req.user.organizationId);
  await logAudit(req.user.id, 'DELETE_SUPPLIER', 'suppliers', supplier.id, { companyName: supplier.company_name }, null, req.user.organizationId);
  res.json({ success: true, message: 'Supplier deleted successfully.' });
});

module.exports = { getSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier };
