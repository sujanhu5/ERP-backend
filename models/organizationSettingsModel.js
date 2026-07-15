const { query } = require('../config/db');

const OrganizationSettingsModel = {
  async create(client, { organizationId, companyName, gstin, country, state, city }) {
    const res = await client.query(
      `INSERT INTO organization_settings (organization_id, company_name, gstin, country, state, city)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [organizationId, companyName, gstin || null, country || 'India', state || null, city || null]
    );
    return res.rows[0];
  },

  async findByOrganization(organizationId) {
    const res = await query('SELECT * FROM organization_settings WHERE organization_id = $1', [organizationId]);
    return res.rows[0];
  },

  async update(organizationId, fields) {
    const map = {
      companyName: 'company_name', logoUrl: 'logo_url', building: 'building', area: 'area',
      city: 'city', district: 'district', state: 'state', pincode: 'pincode', country: 'country',
      phone: 'phone', email: 'email', gstin: 'gstin', pan: 'pan', gstType: 'gst_type',
      defaultGstPercent: 'default_gst_percent', currency: 'currency', language: 'language',
      timezone: 'timezone', dateFormat: 'date_format', invoicePrefix: 'invoice_prefix', theme: 'theme',
    };
    const keys = Object.keys(fields).filter((k) => map[k] !== undefined && fields[k] !== undefined);
    if (keys.length === 0) return this.findByOrganization(organizationId);
    const setClause = keys.map((k, i) => `${map[k]} = $${i + 1}`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(organizationId);
    const res = await query(
      `UPDATE organization_settings SET ${setClause}, updated_at = now() WHERE organization_id = $${values.length} RETURNING *`,
      values
    );
    return res.rows[0];
  },
};

module.exports = OrganizationSettingsModel;
