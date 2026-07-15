const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ProductModel = require('../models/productModel');

/**
 * @route GET /api/dashboard/summary
 * @desc  Returns headline KPI cards for the dashboard.
 */
const getSummary = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const [
    totalRevenue, todaySales, monthlySales, customerCount,
    productCount, employeeCount, invoiceCount, lowStock,
  ] = await Promise.all([
    query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM invoices WHERE organization_id = $1`, [orgId]),
    query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE organization_id = $1 AND sale_date = CURRENT_DATE`, [orgId]),
    query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE organization_id = $1 AND date_trunc('month', sale_date) = date_trunc('month', CURRENT_DATE)`, [orgId]),
    query(`SELECT COUNT(*) FROM customers WHERE organization_id = $1 AND is_active = true`, [orgId]),
    query(`SELECT COUNT(*) FROM products WHERE organization_id = $1 AND is_active = true`, [orgId]),
    query(`SELECT COUNT(*) FROM employees WHERE organization_id = $1 AND status = 'active'`, [orgId]),
    query(`SELECT COUNT(*) FROM invoices WHERE organization_id = $1`, [orgId]),
    ProductModel.lowStock(orgId),
  ]);

  res.json({
    success: true,
    data: {
      totalRevenue: parseFloat(totalRevenue.rows[0].total),
      todaySales: parseFloat(todaySales.rows[0].total),
      monthlySales: parseFloat(monthlySales.rows[0].total),
      totalCustomers: parseInt(customerCount.rows[0].count, 10),
      totalProducts: parseInt(productCount.rows[0].count, 10),
      totalEmployees: parseInt(employeeCount.rows[0].count, 10),
      totalInvoices: parseInt(invoiceCount.rows[0].count, 10),
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock.slice(0, 5),
    },
  });
});

/**
 * @route GET /api/dashboard/sales-graph?days=30
 * @desc  Daily sales totals for the last N days, for a line/bar chart.
 */
const getSalesGraph = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const res1 = await query(
    `SELECT sale_date, SUM(total_amount) AS total
     FROM sales
     WHERE organization_id = $1 AND sale_date >= CURRENT_DATE - $2::int
     GROUP BY sale_date
     ORDER BY sale_date ASC`,
    [req.user.organizationId, days]
  );
  res.json({ success: true, data: res1.rows });
});

/**
 * @route GET /api/dashboard/revenue-graph?months=6
 * @desc  Monthly revenue totals for the last N months.
 */
const getRevenueGraph = asyncHandler(async (req, res) => {
  const months = parseInt(req.query.months, 10) || 6;
  const res1 = await query(
    `SELECT date_trunc('month', sale_date) AS month, SUM(total_amount) AS total
     FROM sales
     WHERE organization_id = $1 AND sale_date >= CURRENT_DATE - ($2 || ' months')::interval
     GROUP BY month
     ORDER BY month ASC`,
    [req.user.organizationId, months]
  );
  res.json({ success: true, data: res1.rows });
});

/**
 * @route GET /api/dashboard/top-products?limit=5
 */
const getTopProducts = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 5;
  const products = await ProductModel.topSelling(req.user.organizationId, limit);
  res.json({ success: true, data: products });
});

module.exports = { getSummary, getSalesGraph, getRevenueGraph, getTopProducts };
