const { query } = require('../config/db');
const BlogTagModel = require('./blogTagModel');

function slugifyBase(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 300);
}

async function uniqueBlogSlug(title, excludeId = null) {
  const base = slugifyBase(title);
  let slug = base;
  let i = 0;
  while (i < 20) {
    const res = await query(
      'SELECT id FROM blogs WHERE slug = $1' + (excludeId ? ' AND id <> $2' : ''),
      excludeId ? [slug, excludeId] : [slug]
    );
    if (res.rows.length === 0) return slug;
    i++;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

function estimateReadingTime(html = '') {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return { minutes: Math.max(1, Math.ceil(words / 200)), words };
}

const BLOG_SELECT = `
  b.*,
  COALESCE(b.author_display_name, u.name) AS author_name,
  u.email AS author_email,
  bc.name  AS category_name,
  bc.slug  AS category_slug,
  bc.color AS category_color,
  COALESCE(
    (SELECT JSON_AGG(JSON_BUILD_OBJECT('id',t.id,'name',t.name,'slug',t.slug))
     FROM blog_tags t JOIN blog_tag_map m ON m.tag_id = t.id WHERE m.blog_id = b.id),
    '[]'
  ) AS tags
`;

const BlogModel = {
  async findAll({ page = 1, limit = 12, status, category, tag, search, pinned, featured } = {}) {
    const conditions = [];
    const params = [];
    let p = 1;

    if (status) { conditions.push(`b.status = $${p++}`); params.push(status); }
    if (category) { conditions.push(`bc.slug = $${p++}`); params.push(category); }
    if (tag) { conditions.push(`EXISTS(SELECT 1 FROM blog_tag_map m2 JOIN blog_tags t2 ON t2.id=m2.tag_id WHERE m2.blog_id=b.id AND t2.slug=$${p++})`); params.push(tag); }
    if (pinned !== undefined) { conditions.push(`b.is_pinned = $${p++}`); params.push(pinned); }
    if (featured !== undefined) { conditions.push(`b.is_featured = $${p++}`); params.push(featured); }
    if (search) {
      conditions.push(`(b.title ILIKE $${p} OR b.excerpt ILIKE $${p} OR b.content ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT ${BLOG_SELECT}
         FROM blogs b
         LEFT JOIN users u ON u.id = b.author_id
         LEFT JOIN blog_categories bc ON bc.id = b.category_id
         ${where}
         ORDER BY b.is_pinned DESC, b.published_at DESC NULLS LAST, b.created_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM blogs b
         LEFT JOIN blog_categories bc ON bc.id = b.category_id
         ${where}`,
        params
      ),
    ]);

    return { rows: dataRes.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async findById(id) {
    const res = await query(
      `SELECT ${BLOG_SELECT}
       FROM blogs b
       LEFT JOIN users u ON u.id = b.author_id
       LEFT JOIN blog_categories bc ON bc.id = b.category_id
       WHERE b.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async findBySlug(slug) {
    const res = await query(
      `SELECT ${BLOG_SELECT}
       FROM blogs b
       LEFT JOIN users u ON u.id = b.author_id
       LEFT JOIN blog_categories bc ON bc.id = b.category_id
       WHERE b.slug = $1 AND b.status = 'published'`,
      [slug]
    );
    return res.rows[0] || null;
  },

  async create({ title, excerpt, content, contentJson, featuredImage, authorId, authorDisplayName, categoryId,
    status, isPinned, isFeatured, publishedAt, scheduledAt,
    metaTitle, metaDescription, focusKeyword, tags = [] }) {
    const slug = await uniqueBlogSlug(title);
    const { minutes, words } = estimateReadingTime(content || '');
    const res = await query(
      `INSERT INTO blogs
         (title, slug, excerpt, content, content_json, featured_image, author_id, author_display_name, category_id,
          status, is_pinned, is_featured, published_at, scheduled_at,
          meta_title, meta_description, focus_keyword, reading_time_minutes, word_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        title.trim(), slug, excerpt || null, content || null,
        contentJson ? JSON.stringify(contentJson) : null,
        featuredImage || null, authorId || null, authorDisplayName || null, categoryId || null,
        status || 'draft', isPinned || false, isFeatured || false,
        publishedAt || (status === 'published' ? new Date() : null),
        scheduledAt || null,
        metaTitle || title.trim(), metaDescription || excerpt || null,
        focusKeyword || null, minutes, words,
      ]
    );
    const blog = res.rows[0];
    if (tags.length) await BlogTagModel.syncTagsForBlog(blog.id, tags);
    return BlogModel.findById(blog.id);
  },

  async update(id, fields) {
    const existing = await BlogModel.findById(id);
    if (!existing) return null;

    const {
      title = existing.title, excerpt = existing.excerpt,
      content = existing.content, contentJson, featuredImage,
      authorDisplayName,
      categoryId = existing.category_id, status = existing.status,
      isPinned = existing.is_pinned, isFeatured = existing.is_featured,
      publishedAt, scheduledAt, metaTitle, metaDescription, focusKeyword,
      tags,
    } = fields;

    const { minutes, words } = estimateReadingTime(content || '');
    const resolvedPublishedAt =
      publishedAt !== undefined ? publishedAt
      : (status === 'published' && !existing.published_at) ? new Date()
      : existing.published_at;

    await query(
      `UPDATE blogs SET
         title=$1, excerpt=$2, content=$3, content_json=$4, featured_image=$5,
         author_display_name=$6, category_id=$7, status=$8, is_pinned=$9, is_featured=$10,
         published_at=$11, scheduled_at=$12,
         meta_title=$13, meta_description=$14, focus_keyword=$15,
         reading_time_minutes=$16, word_count=$17, updated_at=NOW()
       WHERE id=$18`,
      [
        title.trim(), excerpt || null, content || null,
        contentJson !== undefined ? (contentJson ? JSON.stringify(contentJson) : null) : existing.content_json,
        featuredImage !== undefined ? featuredImage : existing.featured_image,
        authorDisplayName !== undefined ? (authorDisplayName || null) : existing.author_display_name,
        categoryId || null, status, isPinned, isFeatured,
        resolvedPublishedAt,
        scheduledAt !== undefined ? scheduledAt : existing.scheduled_at,
        metaTitle || title.trim(),
        metaDescription || excerpt || existing.meta_description,
        focusKeyword !== undefined ? focusKeyword : existing.focus_keyword,
        minutes, words, id,
      ]
    );
    if (tags !== undefined) await BlogTagModel.syncTagsForBlog(id, tags);
    return BlogModel.findById(id);
  },

  async remove(id) {
    await query('DELETE FROM blogs WHERE id = $1', [id]);
  },

  async bulkUpdateStatus(ids, status) {
    if (!ids.length) return;
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    const publishedAt = status === 'published' ? 'NOW()' : 'published_at';
    await query(
      `UPDATE blogs SET status=$1, published_at=${publishedAt}, updated_at=NOW()
       WHERE id IN (${placeholders})`,
      [status, ...ids]
    );
  },

  async bulkDelete(ids) {
    if (!ids.length) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await query(`DELETE FROM blogs WHERE id IN (${placeholders})`, ids);
  },

  async incrementView(id, ip, userAgent) {
    await query(
      'INSERT INTO blog_views (blog_id, ip_address, user_agent) VALUES ($1,$2,$3)',
      [id, ip || null, userAgent || null]
    );
    await query('UPDATE blogs SET view_count = view_count + 1 WHERE id = $1', [id]);
  },

  async toggleLike(id, ip) {
    const existing = await query(
      'SELECT id FROM blog_likes WHERE blog_id=$1 AND ip_address=$2',
      [id, ip]
    );
    if (existing.rows.length) {
      await query('DELETE FROM blog_likes WHERE blog_id=$1 AND ip_address=$2', [id, ip]);
      await query('UPDATE blogs SET like_count = GREATEST(0, like_count - 1) WHERE id=$1', [id]);
      return { liked: false };
    }
    await query('INSERT INTO blog_likes (blog_id, ip_address) VALUES ($1,$2)', [id, ip]);
    await query('UPDATE blogs SET like_count = like_count + 1 WHERE id=$1', [id]);
    return { liked: true };
  },

  async stats() {
    const res = await query(`
      SELECT
        COUNT(*) FILTER (WHERE TRUE)::int                       AS total,
        COUNT(*) FILTER (WHERE status='published')::int         AS published,
        COUNT(*) FILTER (WHERE status='draft')::int             AS drafts,
        COUNT(*) FILTER (WHERE status='scheduled')::int         AS scheduled,
        COALESCE(SUM(view_count),0)::int                        AS total_views,
        COALESCE(SUM(like_count),0)::int                        AS total_likes
      FROM blogs
    `);
    return res.rows[0];
  },

  async related(id, categoryId, limit = 4) {
    const res = await query(
      `SELECT ${BLOG_SELECT}
       FROM blogs b
       LEFT JOIN users u ON u.id = b.author_id
       LEFT JOIN blog_categories bc ON bc.id = b.category_id
       WHERE b.id <> $1 AND b.status = 'published'
         AND (b.category_id = $2 OR $2 IS NULL)
       ORDER BY b.published_at DESC NULLS LAST
       LIMIT $3`,
      [id, categoryId || null, limit]
    );
    return res.rows;
  },
};

module.exports = BlogModel;
