const { query } = require('../config/db');

const CustomerModel = {
  async create(organizationId, { name, email, phone, gstin, address }) {
    const res = await query(
      `INSERT INTO customers (organization_id, name, email, phone, gstin, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [organizationId, name, email || null, phone || null, gstin || null, address || null]
    );
    return res.rows[0];
  },

  async findAll(organizationId, { limit, offset, search }) {
    const params = [organizationId];
    let where = 'WHERE organization_id = $1 AND is_active = true';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    params.push(limit, offset);
    const res = await query(
      `SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM customers ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async findById(id, organizationId) {
    const res = await query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    return res.rows[0];
  },

  async purchaseHistory(id, organizationId) {
    const res = await query(
      `SELECT i.id, i.invoice_number, i.total_amount, i.payment_status, i.created_at
       FROM invoices i WHERE i.customer_id = $1 AND i.organization_id = $2 ORDER BY i.created_at DESC`,
      [id, organizationId]
    );
    return res.rows;
  },

  async update(id, fields, organizationId) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id, organizationId);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(id, organizationId);
    const res = await query(
      `UPDATE customers SET ${setClause} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values
    );
    return res.rows[0];
  },

  async adjustOutstanding(id, delta, organizationId) {
    const res = await query(
      'UPDATE customers SET outstanding_balance = outstanding_balance + $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
      [delta, id, organizationId]
    );
    return res.rows[0];
  },

  async softDelete(id, organizationId) {
    await query('UPDATE customers SET is_active = false WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  },
};

module.exports = CustomerModel;
