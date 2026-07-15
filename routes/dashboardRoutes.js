const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');

router.use(protect, requireOrg);

router.get('/summary', dashboardController.getSummary);
router.get('/sales-graph', dashboardController.getSalesGraph);
router.get('/revenue-graph', dashboardController.getRevenueGraph);
router.get('/top-products', dashboardController.getTopProducts);

module.exports = router;
