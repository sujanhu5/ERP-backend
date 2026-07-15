const { query } = require('../config/db');

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

async function uniqueSlug(name, excludeId = null) {
  const base = slugify(name);
  let slug = base;
  let i = 0;
  while (i < 10) {
    const res = await query(
      'SELECT id FROM blog_categories WHERE slug = $1' + (excludeId ? ' AND id <> $2' : ''),
      excludeId ? [slug, excludeId] : [slug]
    );
    if (res.rows.length === 0) return slug;
    i++;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

const BlogCategoryModel = {
  async findAll() {
    const res = await query(
      `SELECT bc.*, COUNT(b.id)::int AS blog_count
       FROM blog_categories bc
       LEFT JOIN blogs b ON b.category_id = bc.id AND b.status = 'published'
       GROUP BY bc.id
       ORDER BY bc.name ASC`
    );
    return res.rows;
  },

  async findById(id) {
    const res = await query('SELECT * FROM blog_categories WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async findBySlug(slug) {
    const res = await query('SELECT * FROM blog_categories WHERE slug = $1', [slug]);
    return res.rows[0] || null;
  },

  async create({ name, description, color }) {
    const slug = await uniqueSlug(name);
    const res = await query(
      `INSERT INTO blog_categories (name, slug, description, color)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [name.trim(), slug, description || null, color || '#D62828']
    );
    return res.rows[0];
  },

  async update(id, { name, description, color }) {
    const existing = await BlogCategoryModel.findById(id);
    if (!existing) return null;
    const slug = name ? await uniqueSlug(name, id) : existing.slug;
    const res = await query(
      `UPDATE blog_categories
       SET name=$1, slug=$2, description=$3, color=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name?.trim() || existing.name, slug, description ?? existing.description, color || existing.color, id]
    );
    return res.rows[0];
  },

  async remove(id) {
    await query('DELETE FROM blog_categories WHERE id = $1', [id]);
  },
};

module.exports = BlogCategoryModel;
