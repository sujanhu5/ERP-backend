const { query } = require('../config/db');

/**
 * Writes an entry to audit_logs. Never throws — audit logging must
 * not break the primary request flow if it fails.
 */
const logAudit = async (userId, action, entity, entityId, details = {}, ipAddress = null, organizationId = null) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId || null, action, entity || null, entityId || null, JSON.stringify(details), ipAddress, organizationId || null]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

module.exports = { logAudit };
