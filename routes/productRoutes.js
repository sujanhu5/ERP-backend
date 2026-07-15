const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { productValidator } = require('../validators/productValidator');
const { upload, persistUpload } = require('../middleware/uploadMiddleware');

router.use(protect, requireOrg); // all product routes require authentication + an organization

router.get('/', productController.getProducts);
router.get('/low-stock', productController.getLowStock);
router.get('/top-selling', productController.getTopSelling);
router.get('/:id', productController.getProductById);

// Admin + Manager can create/update
router.post(
  '/',
  authorize('admin', 'manager'),
  upload.single('image'),
  persistUpload,
  productValidator,
  validateRequest,
  productController.createProduct
);
router.put(
  '/:id',
  authorize('admin', 'manager'),
  upload.single('image'),
  persistUpload,
  productController.updateProduct
);

// Admin only can delete
router.delete('/:id', authorize('admin'), productController.deleteProduct);

module.exports = router;
