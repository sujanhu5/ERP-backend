const { query } = require('../config/db');

const UserModel = {
  async create({ name, email, passwordHash, role, organizationId }) {
    const res = await query(
      `INSERT INTO users (name, email, password_hash, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, organization_id, created_at`,
      [name, email, passwordHash, role, organizationId || null]
    );
    return res.rows[0];
  },

  async findByEmail(email) {
    const res = await query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0];
  },

  async findById(id) {
    const res = await query(
      'SELECT id, name, email, role, organization_id, avatar_url, is_active, last_login, created_at FROM users WHERE id = $1',
      [id]
    );
    return res.rows[0];
  },

  async findAll(organizationId, { limit, offset, search }) {
    const conditions = ['organization_id = $1'];
    const params = [organizationId];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);
    const res = await query(
      `SELECT id, name, email, role, is_active, last_login, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM users ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async updateRefreshToken(id, token) {
    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [token, id]);
  },

  async updateLastLogin(id) {
    await query('UPDATE users SET last_login = now() WHERE id = $1', [id]);
  },

  async findByRefreshToken(token) {
    const res = await query('SELECT * FROM users WHERE refresh_token = $1', [token]);
    return res.rows[0];
  },

  /** Org-scoped lookup, used by admin user-management endpoints. */
  async findByIdInOrg(id, organizationId) {
    const res = await query(
      'SELECT id, name, email, role, organization_id, avatar_url, is_active, last_login, created_at FROM users WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return res.rows[0];
  },

  async update(id, fields, organizationId) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return organizationId ? this.findByIdInOrg(id, organizationId) : this.findById(id);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(id);
    let sql = `UPDATE users SET ${setClause} WHERE id = $${values.length}`;
    if (organizationId) {
      values.push(organizationId);
      sql += ` AND organization_id = $${values.length}`;
    }
    sql += ' RETURNING id, name, email, role, is_active';
    const res = await query(sql, values);
    return res.rows[0];
  },

  async updatePassword(id, passwordHash) {
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  },

  async delete(id, organizationId) {
    if (organizationId) {
      await query('DELETE FROM users WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    } else {
      await query('DELETE FROM users WHERE id = $1', [id]);
    }
  },
};

module.exports = UserModel;
