const { query } = require('../config/db');

const BlogImageModel = {
  async findAll({ folder, search, page = 1, limit = 30 } = {}) {
    const conditions = [];
    const params = [];
    let p = 1;

    if (folder) { conditions.push(`folder = $${p++}`); params.push(folder); }
    if (search) {
      conditions.push(`(filename ILIKE $${p} OR alt_text ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      query(`SELECT * FROM blog_images ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM blog_images ${where}`, params),
    ]);

    return { rows: dataRes.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async create({ filename, url, sizeBytes, mimeType, altText, folder, uploadedBy }) {
    const res = await query(
      `INSERT INTO blog_images (filename, url, size_bytes, mime_type, alt_text, folder, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [filename, url, sizeBytes || null, mimeType || null, altText || null, folder || 'blog', uploadedBy || null]
    );
    return res.rows[0];
  },

  async updateAlt(id, altText) {
    const res = await query(
      'UPDATE blog_images SET alt_text=$1 WHERE id=$2 RETURNING *',
      [altText, id]
    );
    return res.rows[0];
  },

  async remove(id) {
    await query('DELETE FROM blog_images WHERE id=$1', [id]);
  },
};

module.exports = BlogImageModel;
