const { query } = require('../config/db');

const OrganizationModel = {
  async create(client, { name, slug, businessType, gstin, pan, email, phone, country, state, city }) {
    const res = await client.query(
      `INSERT INTO organizations (name, slug, business_type, gstin, pan, email, phone, country, state, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [name, slug, businessType || null, gstin || null, pan || null, email || null,
        phone || null, country || 'India', state || null, city || null]
    );
    return res.rows[0];
  },

  async findById(id) {
    const res = await query('SELECT * FROM organizations WHERE id = $1', [id]);
    return res.rows[0];
  },

  async findBySlug(slug) {
    const res = await query('SELECT * FROM organizations WHERE slug = $1', [slug]);
    return res.rows[0];
  },

  async findAll({ limit, offset, search, status }) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    const res = await query(
      `SELECT * FROM organizations ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM organizations ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async updateStatus(id, status) {
    const res = await query('UPDATE organizations SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    return res.rows[0];
  },
};

module.exports = OrganizationModel;
