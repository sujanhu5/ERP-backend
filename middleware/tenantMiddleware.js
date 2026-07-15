const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Requires the authenticated user to belong to an organization, and that the
 * organization is still active. Blocks platform-owner tokens (no org) from
 * tenant routes, and locks out every user of a suspended/deleted company.
 * Must run after `protect`.
 */
const requireOrg = asyncHandler(async (req, res, next) => {
  if (!req.user || !req.user.organizationId) {
    throw new ApiError(403, 'This action requires an organization context.');
  }

  const res1 = await query('SELECT status FROM organizations WHERE id = $1', [req.user.organizationId]);
  const org = res1.rows[0];
  if (!org) throw new ApiError(403, 'Organization not found.');

  if (org.status === 'suspended') {
    throw new ApiError(403, 'This company account has been suspended. Please contact support.');
  }
  if (org.status === 'deleted') {
    throw new ApiError(403, 'This company account no longer exists.');
  }

  next();
});

/**
 * Restricts a route to the platform owner only. Must run after `protect`.
 */
const requirePlatformOwner = (req, res, next) => {
  if (!req.user || req.user.role !== 'platform_owner') {
    throw new ApiError(403, 'Access denied. Platform owner only.');
  }
  next();
};

module.exports = { requireOrg, requirePlatformOwner };
