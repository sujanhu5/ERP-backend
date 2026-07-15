const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platformController');
const { protect } = require('../middleware/authMiddleware');
const { requirePlatformOwner } = require('../middleware/tenantMiddleware');

// Every route here spans all tenants — platform owner only, no exceptions.
router.use(protect, requirePlatformOwner);

router.get('/summary', platformController.getSummary);
router.get('/analytics', platformController.getAnalytics);
router.get('/health', platformController.getHealth);
router.get('/audit-logs', platformController.getAuditLogs);

router.get('/companies', platformController.getCompanies);
router.get('/companies/:id', platformController.getCompanyById);
router.patch('/companies/:id/status', platformController.updateCompanyStatus);
router.post('/companies/:id/reset-password', platformController.resetCompanyPassword);
router.delete('/companies/:id', platformController.deleteCompany);

module.exports = router;
