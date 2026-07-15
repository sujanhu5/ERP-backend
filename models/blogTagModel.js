const { query } = require('../config/db');

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

async function uniqueSlug(name, excludeId = null) {
  const base = slugify(name);
  let slug = base;
  let i = 0;
  while (i < 10) {
    const res = await query(
      'SELECT id FROM blog_tags WHERE slug = $1' + (excludeId ? ' AND id <> $2' : ''),
      excludeId ? [slug, excludeId] : [slug]
    );
    if (res.rows.length === 0) return slug;
    i++;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

const BlogTagModel = {
  async findAll() {
    const res = await query(
      `SELECT t.*, COUNT(m.blog_id)::int AS blog_count
       FROM blog_tags t
       LEFT JOIN blog_tag_map m ON m.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`
    );
    return res.rows;
  },

  async findBySlug(slug) {
    const res = await query('SELECT * FROM blog_tags WHERE slug = $1', [slug]);
    return res.rows[0] || null;
  },

  async findOrCreate(name) {
    const norm = name.trim().toLowerCase();
    const existing = await query('SELECT * FROM blog_tags WHERE LOWER(name) = $1', [norm]);
    if (existing.rows.length) return existing.rows[0];
    const slug = await uniqueSlug(name);
    const res = await query(
      'INSERT INTO blog_tags (name, slug) VALUES ($1,$2) RETURNING *',
      [name.trim(), slug]
    );
    return res.rows[0];
  },

  async syncTagsForBlog(blogId, tagNames = []) {
    await query('DELETE FROM blog_tag_map WHERE blog_id = $1', [blogId]);
    for (const name of tagNames) {
      if (!name?.trim()) continue;
      const tag = await BlogTagModel.findOrCreate(name.trim());
      await query(
        'INSERT INTO blog_tag_map (blog_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [blogId, tag.id]
      );
    }
  },

  async getTagsForBlog(blogId) {
    const res = await query(
      `SELECT t.* FROM blog_tags t
       JOIN blog_tag_map m ON m.tag_id = t.id
       WHERE m.blog_id = $1 ORDER BY t.name`,
      [blogId]
    );
    return res.rows;
  },

  async remove(id) {
    await query('DELETE FROM blog_tags WHERE id = $1', [id]);
  },
};

module.exports = BlogTagModel;
