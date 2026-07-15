const { query } = require('../config/db');

/**
 * Cross-organization aggregates for the Platform Owner (Super Admin) panel.
 * Every query here deliberately spans all tenants — it is only ever reachable
 * behind `requirePlatformOwner`.
 */
const PlatformModel = {
  /** Headline KPI cards. */
  async summary() {
    const [
      companies, activeCompanies, suspendedCompanies, users, employees,
      revenue, invoices, inventoryValue, storage,
    ] = await Promise.all([
      query(`SELECT COUNT(*) FROM organizations WHERE status <> 'deleted'`),
      query(`SELECT COUNT(*) FROM organizations WHERE status = 'active'`),
      query(`SELECT COUNT(*) FROM organizations WHERE status = 'suspended'`),
      query(`SELECT COUNT(*) FROM users WHERE is_active = true AND organization_id IS NOT NULL`),
      query(`SELECT COUNT(*) FROM employees WHERE status = 'active'`),
      query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM invoices`),
      query(`SELECT COUNT(*) FROM invoices`),
      query(`SELECT COALESCE(SUM(current_stock * purchase_price),0) AS total FROM products WHERE is_active = true`),
      query(`SELECT COALESCE(SUM(total_size_mb),0) AS total FROM organization_storage`),
    ]);

    return {
      totalCompanies: parseInt(companies.rows[0].count, 10),
      activeCompanies: parseInt(activeCompanies.rows[0].count, 10),
      suspendedCompanies: parseInt(suspendedCompanies.rows[0].count, 10),
      totalUsers: parseInt(users.rows[0].count, 10),
      totalEmployees: parseInt(employees.rows[0].count, 10),
      totalRevenue: parseFloat(revenue.rows[0].total),
      totalInvoices: parseInt(invoices.rows[0].count, 10),
      inventoryValue: parseFloat(inventoryValue.rows[0].total),
      storageUsedMb: parseFloat(storage.rows[0].total),
    };
  },

  /** Daily signups for the last N days. */
  async signups(days = 30) {
    const res = await query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM organizations
       WHERE created_at >= CURRENT_DATE - $1::int
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );
    return res.rows;
  },

  /** Monthly company growth for the last N months. */
  async growth(months = 6) {
    const res = await query(
      `SELECT date_trunc('month', created_at) AS month, COUNT(*) AS count
       FROM organizations
       WHERE created_at >= CURRENT_DATE - ($1 || ' months')::interval
       GROUP BY month
       ORDER BY month ASC`,
      [months]
    );
    return res.rows;
  },

  /** Companies ranked by revenue, for the "most active" panel. */
  async topCompanies(limit = 5) {
    const res = await query(
      `SELECT o.id, o.name, o.status,
              COUNT(i.id) AS invoice_count,
              COALESCE(SUM(i.total_amount),0) AS revenue
       FROM organizations o
       LEFT JOIN invoices i ON i.organization_id = o.id
       WHERE o.status <> 'deleted'
       GROUP BY o.id, o.name, o.status
       ORDER BY revenue DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  },

  /** Subscription plan distribution, for the pie chart. */
  async planDistribution() {
    const res = await query(
      `SELECT plan, COUNT(*) AS count
       FROM organizations
       WHERE status <> 'deleted'
       GROUP BY plan
       ORDER BY count DESC`
    );
    return res.rows;
  },

  /** Most recent logins across every tenant. */
  async recentLogins(limit = 8) {
    const res = await query(
      `SELECT u.name, u.email, u.role, u.last_login, o.name AS company
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.last_login IS NOT NULL
       ORDER BY u.last_login DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  },

  /** Platform-wide audit trail. */
  async auditLogs({ limit, offset, organizationId }) {
    const conditions = [];
    const params = [];
    if (organizationId) {
      params.push(organizationId);
      conditions.push(`a.organization_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const res = await query(
      `SELECT a.id, a.action, a.entity, a.created_at, a.details,
              u.name AS user_name, o.name AS company
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN organizations o ON a.organization_id = o.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM audit_logs a ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  /** Companies list with per-company rollups, for the management table. */
  async companies({ limit, offset, search, status }) {
    const conditions = [`o.status <> 'deleted'`];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(o.name ILIKE $${params.length} OR o.email ILIKE $${params.length} OR o.gstin ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const res = await query(
      `SELECT o.id, o.name, o.slug, o.business_type, o.gstin, o.email, o.phone,
              o.city, o.state, o.status, o.plan, o.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
              (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id) AS invoice_count,
              (SELECT COALESCE(SUM(i.total_amount),0) FROM invoices i WHERE i.organization_id = o.id) AS revenue
       FROM organizations o
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(`SELECT COUNT(*) FROM organizations o ${where}`, countParams);
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  /** Full drill-down for a single company. */
  async companyDetail(id) {
    const orgRes = await query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (orgRes.rows.length === 0) return null;

    const [settings, users, stats, lowStock] = await Promise.all([
      query('SELECT * FROM organization_settings WHERE organization_id = $1', [id]),
      query(
        `SELECT id, name, email, role, is_active, last_login, created_at
         FROM users WHERE organization_id = $1 ORDER BY created_at ASC`,
        [id]
      ),
      query(
        `SELECT
           (SELECT COUNT(*) FROM products WHERE organization_id = $1 AND is_active = true) AS products,
           (SELECT COUNT(*) FROM customers WHERE organization_id = $1 AND is_active = true) AS customers,
           (SELECT COUNT(*) FROM employees WHERE organization_id = $1) AS employees,
           (SELECT COUNT(*) FROM invoices WHERE organization_id = $1) AS invoices,
           (SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE organization_id = $1) AS revenue,
           (SELECT COALESCE(SUM(current_stock * purchase_price),0) FROM products WHERE organization_id = $1 AND is_active = true) AS inventory_value`,
        [id]
      ),
      query(
        `SELECT COUNT(*) FROM products
         WHERE organization_id = $1 AND is_active = true AND current_stock <= minimum_stock`,
        [id]
      ),
    ]);

    return {
      ...orgRes.rows[0],
      settings: settings.rows[0] || null,
      users: users.rows,
      stats: {
        products: parseInt(stats.rows[0].products, 10),
        customers: parseInt(stats.rows[0].customers, 10),
        employees: parseInt(stats.rows[0].employees, 10),
        invoices: parseInt(stats.rows[0].invoices, 10),
        revenue: parseFloat(stats.rows[0].revenue),
        inventoryValue: parseFloat(stats.rows[0].inventory_value),
        lowStock: parseInt(lowStock.rows[0].count, 10),
      },
    };
  },

  /** Finds the admin account of a company (used for password resets). */
  async findCompanyAdmin(organizationId) {
    const res = await query(
      `SELECT id, name, email FROM users
       WHERE organization_id = $1 AND role = 'admin'
       ORDER BY created_at ASC LIMIT 1`,
      [organizationId]
    );
    return res.rows[0];
  },
};

module.exports = PlatformModel;
