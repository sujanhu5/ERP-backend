const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { toCSV } = require('../utils/csvExporter');

/**
 * @route GET /api/reports/daily-sales?date=YYYY-MM-DD
 */
const dailySales = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT i.invoice_number, c.name AS customer_name, i.total_amount, i.payment_status, i.created_at
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.organization_id = $1 AND DATE(i.created_at) = $2 ORDER BY i.created_at DESC`,
    [req.user.organizationId, date]
  );
  res.json({ success: true, data: result.rows });
});

/**
 * @route GET /api/reports/monthly-sales?month=&year=
 */
const monthlySales = asyncHandler(async (req, res) => {
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const result = await query(
    `SELECT DATE(i.created_at) AS date, COUNT(*) AS invoice_count, SUM(i.total_amount) AS total
     FROM invoices i
     WHERE i.organization_id = $1 AND EXTRACT(MONTH FROM i.created_at) = $2 AND EXTRACT(YEAR FROM i.created_at) = $3
     GROUP BY DATE(i.created_at) ORDER BY date ASC`,
    [req.user.organizationId, month, year]
  );
  res.json({ success: true, data: result.rows });
});

/**
 * @route GET /api/reports/revenue?fromDate=&toDate=
 */
const revenueReport = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const conditions = ['organization_id = $1'];
  const params = [req.user.organizationId];
  if (fromDate) { params.push(fromDate); conditions.push(`created_at >= $${params.length}`); }
  if (toDate) { params.push(toDate); conditions.push(`created_at <= $${params.length}`); }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await query(
    `SELECT COUNT(*) AS invoice_count, COALESCE(SUM(total_amount),0) AS total_revenue,
            COALESCE(SUM(gst_amount),0) AS total_gst, COALESCE(SUM(discount_amount),0) AS total_discount
     FROM invoices ${where}`,
    params
  );
  res.json({ success: true, data: result.rows[0] });
});

/**
 * @route GET /api/reports/inventory
 */
const inventoryReport = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT p.name, p.sku, p.current_stock, p.minimum_stock, p.purchase_price, p.selling_price,
            (p.current_stock * p.purchase_price) AS stock_value, c.name AS category_name
     FROM products p LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.organization_id = $1 AND p.is_active = true ORDER BY p.name ASC`,
    [req.user.organizationId]
  );
  res.json({ success: true, data: result.rows });
});

/**
 * @route GET /api/reports/customers
 */
const customerReport = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.name, c.email, c.phone, c.outstanding_balance,
            COUNT(i.id) AS total_orders, COALESCE(SUM(i.total_amount),0) AS lifetime_value
     FROM customers c LEFT JOIN invoices i ON i.customer_id = c.id
     WHERE c.organization_id = $1 AND c.is_active = true
     GROUP BY c.id ORDER BY lifetime_value DESC`,
    [req.user.organizationId]
  );
  res.json({ success: true, data: result.rows });
});

/**
 * @route GET /api/reports/top-products?limit=10
 */
const topProductsReport = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const result = await query(
    `SELECT p.name, p.sku, SUM(ii.quantity) AS total_sold, SUM(ii.line_total) AS total_revenue
     FROM invoice_items ii JOIN products p ON ii.product_id = p.id
     WHERE p.organization_id = $1
     GROUP BY p.id, p.name, p.sku ORDER BY total_sold DESC LIMIT $2`,
    [req.user.organizationId, limit]
  );
  res.json({ success: true, data: result.rows });
});

/**
 * @route GET /api/reports/export?type=inventory|customers|sales
 * @desc  Generic CSV export endpoint.
 */
const exportCSV = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const orgId = req.user.organizationId;
  let rows = [];
  let filename = 'export.csv';

  switch (type) {
    case 'inventory': {
      const r = await query(
        `SELECT name, sku, current_stock, minimum_stock, purchase_price, selling_price FROM products WHERE organization_id = $1 AND is_active = true`,
        [orgId]
      );
      rows = r.rows; filename = 'inventory_report.csv';
      break;
    }
    case 'customers': {
      const r = await query(
        `SELECT name, email, phone, outstanding_balance FROM customers WHERE organization_id = $1 AND is_active = true`,
        [orgId]
      );
      rows = r.rows; filename = 'customer_report.csv';
      break;
    }
    case 'sales': {
      const r = await query(
        `SELECT invoice_number, total_amount, payment_status, created_at FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC`,
        [orgId]
      );
      rows = r.rows; filename = 'sales_report.csv';
      break;
    }
    default: {
      const r = await query(
        `SELECT invoice_number, total_amount, payment_status, created_at FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC`,
        [orgId]
      );
      rows = r.rows; filename = 'export.csv';
    }
  }

  const csv = toCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = {
  dailySales, monthlySales, revenueReport, inventoryReport,
  customerReport, topProductsReport, exportCSV,
};
