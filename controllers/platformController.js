const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const PlatformModel = require('../models/platformModel');
const OrganizationModel = require('../models/organizationModel');
const UserModel = require('../models/userModel');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const SALT_ROUNDS = 10;

/**
 * @route GET /api/platform/summary
 */
const getSummary = asyncHandler(async (req, res) => {
  const data = await PlatformModel.summary();
  res.json({ success: true, data });
});

/**
 * @route GET /api/platform/analytics
 * @desc  Everything the Super Admin dashboard charts need, in one round trip.
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const months = parseInt(req.query.months, 10) || 6;

  const [signups, growth, topCompanies, plans, recentLogins] = await Promise.all([
    PlatformModel.signups(days),
    PlatformModel.growth(months),
    PlatformModel.topCompanies(5),
    PlatformModel.planDistribution(),
    PlatformModel.recentLogins(8),
  ]);

  res.json({ success: true, data: { signups, growth, topCompanies, plans, recentLogins } });
});

/**
 * @route GET /api/platform/health
 * @desc  Basic platform health: DB reachability + latency, uptime.
 */
const getHealth = asyncHandler(async (req, res) => {
  const start = Date.now();
  let dbOk = true;
  try {
    await query('SELECT 1');
  } catch {
    dbOk = false;
  }
  const latencyMs = Date.now() - start;

  res.json({
    success: true,
    data: {
      database: dbOk ? 'operational' : 'down',
      latencyMs,
      api: 'operational',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  });
});

/**
 * @route GET /api/platform/companies
 */
const getCompanies = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { rows, total } = await PlatformModel.companies({
    limit, offset, search: req.query.search, status: req.query.status,
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * @route GET /api/platform/companies/:id
 */
const getCompanyById = asyncHandler(async (req, res) => {
  const company = await PlatformModel.companyDetail(req.params.id);
  if (!company) throw new ApiError(404, 'Company not found.');
  res.json({ success: true, data: company });
});

/**
 * @route PATCH /api/platform/companies/:id/status
 * @desc  Suspend or reactivate a company. A suspended company's users are
 *        locked out at login and on every API call.
 */
const updateCompanyStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    throw new ApiError(400, 'Status must be either "active" or "suspended".');
  }

  const org = await OrganizationModel.findById(req.params.id);
  if (!org) throw new ApiError(404, 'Company not found.');

  const updated = await OrganizationModel.updateStatus(req.params.id, status);
  await logAudit(
    req.user.id,
    status === 'suspended' ? 'SUSPEND_COMPANY' : 'ACTIVATE_COMPANY',
    'organizations',
    org.id,
    { name: org.name },
    null,
    org.id
  );

  res.json({ success: true, data: updated, message: `Company ${status === 'suspended' ? 'suspended' : 'activated'}.` });
});

/**
 * @route DELETE /api/platform/companies/:id
 * @desc  Soft-deletes a company (status = 'deleted'). Its data is retained but
 *        the workspace becomes unreachable — deliberately not a hard delete.
 */
const deleteCompany = asyncHandler(async (req, res) => {
  const org = await OrganizationModel.findById(req.params.id);
  if (!org) throw new ApiError(404, 'Company not found.');

  const updated = await OrganizationModel.updateStatus(req.params.id, 'deleted');
  await logAudit(req.user.id, 'DELETE_COMPANY', 'organizations', org.id, { name: org.name }, null, org.id);

  res.json({ success: true, data: updated, message: 'Company deleted.' });
});

/**
 * @route POST /api/platform/companies/:id/reset-password
 * @desc  Issues a new temporary password for the company's admin account and
 *        returns it once, so the platform owner can hand it over.
 */
const resetCompanyPassword = asyncHandler(async (req, res) => {
  const org = await OrganizationModel.findById(req.params.id);
  if (!org) throw new ApiError(404, 'Company not found.');

  const admin = await PlatformModel.findCompanyAdmin(req.params.id);
  if (!admin) throw new ApiError(404, 'This company has no admin account.');

  // Readable but high-entropy: e.g. "Mx-7f3a91c4"
  const tempPassword = `Mx-${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

  await UserModel.updatePassword(admin.id, passwordHash);
  await UserModel.updateRefreshToken(admin.id, null); // force re-login everywhere
  await logAudit(req.user.id, 'RESET_COMPANY_PASSWORD', 'users', admin.id, { company: org.name }, null, org.id);

  res.json({
    success: true,
    message: 'Temporary password issued. Share it with the company admin — it is shown only once.',
    data: { email: admin.email, name: admin.name, tempPassword },
  });
});

/**
 * @route GET /api/platform/audit-logs
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;
  const offset = (page - 1) * limit;

  const { rows, total } = await PlatformModel.auditLogs({
    limit, offset, organizationId: req.query.organizationId,
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

module.exports = {
  getSummary, getAnalytics, getHealth,
  getCompanies, getCompanyById, updateCompanyStatus, deleteCompany,
  resetCompanyPassword, getAuditLogs,
};
