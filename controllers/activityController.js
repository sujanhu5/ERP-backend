const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route GET /api/activity?page=&limit=
 * @desc  The caller's own organization activity feed, drawn from audit_logs.
 *        Strictly org-scoped — a tenant only ever sees its own actions.
 */
const getActivity = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;
  const orgId = req.user.organizationId;

  const [rows, count] = await Promise.all([
    query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at, u.name AS user_name
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.organization_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM audit_logs WHERE organization_id = $1`, [orgId]),
  ]);

  const total = parseInt(count.rows[0].count, 10);
  res.json({
    success: true,
    data: rows.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * @route GET /api/activity/notifications
 * @desc  A lightweight notification feed for the bell menu: the most recent
 *        noteworthy events (invoices, low stock, new customers/employees),
 *        derived live from the org's audit trail + current low-stock state.
 */
const getNotifications = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  const [events, lowStock] = await Promise.all([
    query(
      `SELECT a.id, a.action, a.entity, a.details, a.created_at, u.name AS user_name
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.organization_id = $1
         AND a.action IN ('CREATE_INVOICE','ADD_PAYMENT','CREATE_CUSTOMER','CREATE_EMPLOYEE','CREATE_PRODUCT')
       ORDER BY a.created_at DESC
       LIMIT 8`,
      [orgId]
    ),
    query(
      `SELECT COUNT(*) FROM products
       WHERE organization_id = $1 AND is_active = true AND current_stock <= minimum_stock`,
      [orgId]
    ),
  ]);

  const labels = {
    CREATE_INVOICE: ['invoice_generated', 'Invoice generated'],
    ADD_PAYMENT: ['payment_received', 'Payment received'],
    CREATE_CUSTOMER: ['customer_added', 'Customer added'],
    CREATE_EMPLOYEE: ['employee_added', 'Employee added'],
    CREATE_PRODUCT: ['product_added', 'Product added'],
  };

  const items = events.rows.map((e) => {
    const [type, title] = labels[e.action] || ['system', e.action];
    const detail = e.details && typeof e.details === 'object'
      ? (e.details.invoiceNumber || e.details.name || e.details.companyName || '')
      : '';
    return {
      id: e.id,
      type,
      title,
      message: [detail, e.user_name ? `by ${e.user_name}` : ''].filter(Boolean).join(' · '),
      created_at: e.created_at,
    };
  });

  const lowStockCount = parseInt(lowStock.rows[0].count, 10);
  if (lowStockCount > 0) {
    items.unshift({
      id: 'low-stock',
      type: 'low_stock',
      title: 'Low stock alert',
      message: `${lowStockCount} product${lowStockCount > 1 ? 's are' : ' is'} at or below minimum stock`,
      created_at: new Date().toISOString(),
    });
  }

  res.json({ success: true, data: items });
});

module.exports = { getActivity, getNotifications };
