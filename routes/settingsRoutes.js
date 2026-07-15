const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const { upload, persistUpload } = require('../middleware/uploadMiddleware');

router.use(protect, requireOrg);

router.get('/', settingsController.getSettings);
router.put('/', authorize('admin'), upload.single('logo'), persistUpload, settingsController.updateSettings);

module.exports = router;
