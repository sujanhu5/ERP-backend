const asyncHandler = require('../utils/asyncHandler');
const OrganizationSettingsModel = require('../models/organizationSettingsModel');
const { logAudit } = require('../utils/auditLogger');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await OrganizationSettingsModel.findByOrganization(req.user.organizationId);
  res.json({ success: true, data: settings || null });
});

/**
 * @route PUT /api/settings (Admin only)
 */
const updateSettings = asyncHandler(async (req, res) => {
  const logoUrl = req.uploadedUrl || (req.file ? `/uploads/${req.user.organizationId}/${req.file.filename}` : req.body.logoUrl);
  const fields = { ...req.body, logoUrl };

  const updated = await OrganizationSettingsModel.update(req.user.organizationId, fields);
  await logAudit(req.user.id, 'UPDATE_SETTINGS', 'organization_settings', updated?.id, req.body, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

module.exports = { getSettings, updateSettings };
