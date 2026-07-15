const { query } = require('../config/db');

const ProductModel = {
  async create(organizationId, data) {
    const {
      name, sku, barcode, categoryId, supplierId, description,
      gstPercent, hsnCode, purchasePrice, sellingPrice, currentStock,
      minimumStock, unit, imageUrl,
    } = data;
    const res = await query(
      `INSERT INTO products
        (organization_id, name, sku, barcode, category_id, supplier_id, description, gst_percent, hsn_code,
         purchase_price, selling_price, current_stock, minimum_stock, unit, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [organizationId, name, sku, barcode || null, categoryId || null, supplierId || null, description || null,
        gstPercent || 0, hsnCode || null, purchasePrice, sellingPrice, currentStock || 0,
        minimumStock || 5, unit || 'pcs', imageUrl || null]
    );
    return res.rows[0];
  },

  async findAll(organizationId, { limit, offset, search, categoryId, lowStockOnly }) {
    const conditions = ['p.organization_id = $1', 'p.is_active = true'];
    const params = [organizationId];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`p.category_id = $${params.length}`);
    }
    if (lowStockOnly === 'true') {
      conditions.push('p.current_stock <= p.minimum_stock');
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const res = await query(
      `SELECT p.*, c.name AS category_name, s.company_name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM products p ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async findById(id, organizationId) {
    const res = await query(
      `SELECT p.*, c.name AS category_name, s.company_name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = $1 AND p.organization_id = $2`,
      [id, organizationId]
    );
    return res.rows[0];
  },

  async findBySku(sku, organizationId) {
    const res = await query('SELECT * FROM products WHERE sku = $1 AND organization_id = $2', [sku, organizationId]);
    return res.rows[0];
  },

  async update(id, fields, organizationId) {
    const map = {
      name: 'name', sku: 'sku', barcode: 'barcode', categoryId: 'category_id',
      supplierId: 'supplier_id', description: 'description', gstPercent: 'gst_percent',
      hsnCode: 'hsn_code', purchasePrice: 'purchase_price', sellingPrice: 'selling_price',
      currentStock: 'current_stock', minimumStock: 'minimum_stock', unit: 'unit',
      imageUrl: 'image_url', isActive: 'is_active',
    };
    const keys = Object.keys(fields).filter((k) => map[k] !== undefined);
    if (keys.length === 0) return this.findById(id, organizationId);
    const setClause = keys.map((k, i) => `${map[k]} = $${i + 1}`).join(', ');
    const values = keys.map((k) => fields[k]);
    values.push(id, organizationId);
    const res = await query(
      `UPDATE products SET ${setClause} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values
    );
    return res.rows[0];
  },

  async adjustStock(id, delta, organizationId) {
    const res = await query(
      'UPDATE products SET current_stock = current_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
      [delta, id, organizationId]
    );
    return res.rows[0];
  },

  async softDelete(id, organizationId) {
    await query('UPDATE products SET is_active = false WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  },

  async hardDelete(id, organizationId) {
    await query('DELETE FROM products WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  },

  async lowStock(organizationId) {
    const res = await query(
      `SELECT * FROM products WHERE organization_id = $1 AND current_stock <= minimum_stock AND is_active = true ORDER BY current_stock ASC`,
      [organizationId]
    );
    return res.rows;
  },

  async topSelling(organizationId, limit = 5) {
    const res = await query(
      `SELECT p.id, p.name, p.sku, SUM(ii.quantity) AS total_sold, SUM(ii.line_total) AS total_revenue
       FROM invoice_items ii
       JOIN products p ON ii.product_id = p.id
       WHERE p.organization_id = $1
       GROUP BY p.id, p.name, p.sku
       ORDER BY total_sold DESC
       LIMIT $2`,
      [organizationId, limit]
    );
    return res.rows;
  },
};

module.exports = ProductModel;
