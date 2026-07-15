const CustomerModel = require('../models/customerModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const getCustomers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { rows, total } = await CustomerModel.findAll(req.user.organizationId, { limit, offset, search: req.query.search });
  res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await CustomerModel.findById(req.params.id, req.user.organizationId);
  if (!customer) throw new ApiError(404, 'Customer not found.');
  const history = await CustomerModel.purchaseHistory(req.params.id, req.user.organizationId);
  res.json({ success: true, data: { ...customer, purchaseHistory: history } });
});

const createCustomer = asyncHandler(async (req, res) => {
  const customer = await CustomerModel.create(req.user.organizationId, req.body);
  await logAudit(req.user.id, 'CREATE_CUSTOMER', 'customers', customer.id, { name: customer.name }, null, req.user.organizationId);
  res.status(201).json({ success: true, data: customer });
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await CustomerModel.findById(req.params.id, req.user.organizationId);
  if (!customer) throw new ApiError(404, 'Customer not found.');
  const updated = await CustomerModel.update(req.params.id, req.body, req.user.organizationId);
  await logAudit(req.user.id, 'UPDATE_CUSTOMER', 'customers', customer.id, req.body, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await CustomerModel.findById(req.params.id, req.user.organizationId);
  if (!customer) throw new ApiError(404, 'Customer not found.');
  await CustomerModel.softDelete(req.params.id, req.user.organizationId);
  await logAudit(req.user.id, 'DELETE_CUSTOMER', 'customers', customer.id, { name: customer.name }, null, req.user.organizationId);
  res.json({ success: true, message: 'Customer deleted successfully.' });
});

module.exports = { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer };
