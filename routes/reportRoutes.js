const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');

router.use(protect, requireOrg);
router.use(authorize('admin', 'manager')); // employees are read-only elsewhere; reports restricted to admin/manager

router.get('/daily-sales', reportController.dailySales);
router.get('/monthly-sales', reportController.monthlySales);
router.get('/revenue', reportController.revenueReport);
router.get('/inventory', reportController.inventoryReport);
router.get('/customers', reportController.customerReport);
router.get('/top-products', reportController.topProductsReport);
router.get('/export', reportController.exportCSV);

module.exports = router;
