const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');

router.use(protect, requireOrg);

router.get('/', activityController.getActivity);
router.get('/notifications', activityController.getNotifications);

module.exports = router;
