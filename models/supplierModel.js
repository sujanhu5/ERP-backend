const { query } = require('../config/db');

const SupplierModel = {
  async create(organizationId, { companyName, gstNumber, phone, email, address }) {
    const res = await query(
      `INSERT INTO suppliers (organization_id, company_name, gst_number, phone, email, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [organizationId, companyName, gstNumber || null, phone || null, email || null, address || null]
    );
    return res.rows[0];
  },

  async findAll(organizationId, { limit, offset, search }) {
    const params = [organizationId];
    let where = 'WHERE organization_id = $1 AND is_active = true';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (company_name ILIKE $${params.length} OR gst_number ILIKE $${params.length})`;
    }
    params.push(limit, offset);
    const res = await query(
      `SELECT * FROM suppliers ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM suppliers ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async findById(id, organizationId) {
    const res = await query('SELECT * FROM suppliers WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    return res.rows[0];
  },

  async productsSupplied(id, organizationId) {
    const res = await query(
      'SELECT id, name, sku, current_stock FROM products WHERE supplier_id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return res.rows;
  },

  async update(id, fields, organizationId) {
    const map = {
      companyName: 'company_name', gstNumber: 'gst_number', phone: 'phone',
      email: 'email', address: 'address',
    };
    const keys = Object.keys(fields).filter((k) => map[k]);
    if (keys.length === 0) return this.findById(id, organizationId);
    const setClause = keys.map((k, i) => `${map[k]} = $${i + 1}`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(id, organizationId);
    const res = await query(
      `UPDATE suppliers SET ${setClause} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values
    );
    return res.rows[0];
  },

  async softDelete(id, organizationId) {
    await query('UPDATE suppliers SET is_active = false WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  },
};

module.exports = SupplierModel;
