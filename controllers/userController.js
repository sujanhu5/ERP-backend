const UserModel = require('../models/userModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { rows, total } = await UserModel.findAll(req.user.organizationId, { limit, offset, search: req.query.search });
  res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await UserModel.findByIdInOrg(req.params.id, req.user.organizationId);
  if (!user) throw new ApiError(404, 'User not found.');
  res.json({ success: true, data: user });
});

const updateUser = asyncHandler(async (req, res) => {
  const { name, role, isActive } = req.body;
  const fields = {};
  if (name) fields.name = name;
  if (role) fields.role = role;
  if (isActive !== undefined) fields.is_active = isActive;

  const updated = await UserModel.update(req.params.id, fields, req.user.organizationId);
  if (!updated) throw new ApiError(404, 'User not found.');
  await logAudit(req.user.id, 'UPDATE_USER', 'users', req.params.id, fields, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await UserModel.findByIdInOrg(req.params.id, req.user.organizationId);
  if (!user) throw new ApiError(404, 'User not found.');
  await UserModel.delete(req.params.id, req.user.organizationId);
  await logAudit(req.user.id, 'DELETE_USER', 'users', req.params.id, { email: user.email }, null, req.user.organizationId);
  res.json({ success: true, message: 'User deleted successfully.' });
});

module.exports = { getUsers, getUserById, updateUser, deleteUser };
