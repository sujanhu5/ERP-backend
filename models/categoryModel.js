const { query } = require('../config/db');

const CategoryModel = {
  async create(organizationId, { name, description }) {
    const res = await query(
      'INSERT INTO categories (organization_id, name, description) VALUES ($1,$2,$3) RETURNING *',
      [organizationId, name, description || null]
    );
    return res.rows[0];
  },

  async findAll(organizationId) {
    const res = await query('SELECT * FROM categories WHERE organization_id = $1 ORDER BY name ASC', [organizationId]);
    return res.rows;
  },

  async findById(id, organizationId) {
    const res = await query('SELECT * FROM categories WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    return res.rows[0];
  },

  async update(id, { name, description }, organizationId) {
    const res = await query(
      'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND organization_id = $4 RETURNING *',
      [name, description, id, organizationId]
    );
    return res.rows[0];
  },

  async delete(id, organizationId) {
    await query('DELETE FROM categories WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  },
};

module.exports = CategoryModel;
