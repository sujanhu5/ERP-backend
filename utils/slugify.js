const { query } = require('../config/db');

function slugifyBase(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'company';
}

/**
 * Generates a unique organization slug from a company name, appending
 * a short random suffix if the base slug is already taken.
 */
async function generateUniqueSlug(name) {
  const base = slugifyBase(name);
  let slug = base;
  let attempt = 0;
  while (attempt < 10) {
    const res = await query('SELECT 1 FROM organizations WHERE slug = $1', [slug]);
    if (res.rows.length === 0) return slug;
    attempt += 1;
    slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return `${base}-${Date.now()}`;
}

module.exports = { generateUniqueSlug };
