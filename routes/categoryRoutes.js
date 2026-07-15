const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');

router.use(protect, requireOrg);

router.get('/', categoryController.getCategories);
router.post('/', authorize('admin', 'manager'), categoryController.createCategory);
router.put('/:id', authorize('admin', 'manager'), categoryController.updateCategory);
router.delete('/:id', authorize('admin'), categoryController.deleteCategory);

module.exports = router;
