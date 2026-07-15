const jwt = require('jsonwebtoken');

/**
 * Generates a short-lived access token and a long-lived refresh token.
 * Access token carries id/role for authorization checks.
 * Refresh token is stored in DB (users.refresh_token) for rotation/invalidation.
 */
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, organizationId: user.organization_id || null },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
}

module.exports = { generateAccessToken, generateRefreshToken };
