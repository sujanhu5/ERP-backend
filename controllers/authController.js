const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const OrganizationModel = require('../models/organizationModel');
const OrganizationSettingsModel = require('../models/organizationSettingsModel');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');
const { generateUniqueSlug } = require('../utils/slugify');
const { getClient } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const SALT_ROUNDS = 10;

const buildAuthResponse = (user, accessToken, refreshToken) => ({
  accessToken,
  refreshToken,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id || null,
  },
});

/**
 * @route POST /api/auth/signup
 * @desc  Public self-service signup. Creates a brand-new organization,
 *        its default settings, and the first admin user, all in one
 *        transaction. Every new company gets a fully isolated workspace.
 */
const signup = asyncHandler(async (req, res) => {
  const {
    companyName, businessType, ownerName, email, phone, password,
    gstNumber, country, state, city,
  } = req.body;

  const existing = await UserModel.findByEmail(email);
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const slug = await generateUniqueSlug(companyName);
    const organization = await OrganizationModel.create(client, {
      name: companyName,
      slug,
      businessType,
      gstin: gstNumber,
      email,
      phone,
      country: country || 'India',
      state,
      city,
    });

    await OrganizationSettingsModel.create(client, {
      organizationId: organization.id,
      companyName,
      gstin: gstNumber,
      country: country || 'India',
      state,
      city,
    });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, organization_id)
       VALUES ($1,$2,$3,'admin',$4)
       RETURNING id, name, email, role, organization_id`,
      [ownerName, email, passwordHash, organization.id]
    );
    const user = userRes.rows[0];

    await client.query('COMMIT');

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    await UserModel.updateRefreshToken(user.id, refreshToken);
    await logAudit(user.id, 'SIGNUP', 'organizations', organization.id, { companyName }, null, organization.id);

    res.status(201).json({ success: true, data: buildAuthResponse(user, accessToken, refreshToken) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/auth/register
 * @desc  Admin creates a Manager/Employee account within their own organization.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const existing = await UserModel.findByEmail(email);
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await UserModel.create({
    name, email, passwordHash, role: role || 'employee', organizationId: req.user.organizationId,
  });

  await logAudit(req.user.id, 'REGISTER', 'users', user.id, { email }, null, req.user.organizationId);

  res.status(201).json({ success: true, data: user });
});

/**
 * @route POST /api/auth/login
 * @desc  Authenticate user, issue access + refresh tokens
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await UserModel.findByEmail(email);
  if (!user || !user.is_active) throw new ApiError(401, 'Invalid credentials.');

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

  // A suspended or deleted company cannot be signed into at all.
  if (user.organization_id) {
    const org = await OrganizationModel.findById(user.organization_id);
    if (!org || org.status === 'deleted') {
      throw new ApiError(403, 'This company account no longer exists.');
    }
    if (org.status === 'suspended') {
      throw new ApiError(403, 'This company account has been suspended. Please contact support.');
    }
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await UserModel.updateRefreshToken(user.id, refreshToken);
  await UserModel.updateLastLogin(user.id);
  await logAudit(user.id, 'LOGIN', 'users', user.id, { email }, null, user.organization_id || null);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ success: true, data: buildAuthResponse(user, accessToken, refreshToken) });
});

/**
 * @route POST /api/auth/refresh
 * @desc  Exchange a valid refresh token for a new access token
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, 'Refresh token required.');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new ApiError(403, 'Invalid or expired refresh token.');
  }

  const user = await UserModel.findByRefreshToken(token);
  if (!user || user.id !== decoded.id) throw new ApiError(403, 'Refresh token not recognized.');

  const accessToken = generateAccessToken(user);
  res.json({ success: true, data: { accessToken } });
});

/**
 * @route POST /api/auth/logout
 * @desc  Invalidate refresh token
 */
const logout = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  if (token) {
    const user = await UserModel.findByRefreshToken(token);
    if (user) await UserModel.updateRefreshToken(user.id, null);
  }
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out successfully.' });
});

/**
 * @route GET /api/auth/me
 * @desc  Return current authenticated user's profile
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw new ApiError(404, 'User not found.');
  res.json({ success: true, data: { ...user, organizationId: user.organization_id || null } });
});

/**
 * @route PUT /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await UserModel.findByEmail(req.user.email);
  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) throw new ApiError(401, 'Current password is incorrect.');

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await UserModel.updatePassword(user.id, newHash);
  await logAudit(user.id, 'CHANGE_PASSWORD', 'users', user.id, {}, null, user.organization_id || null);

  res.json({ success: true, message: 'Password updated successfully.' });
});

module.exports = { signup, register, login, refresh, logout, getMe, changePassword };
