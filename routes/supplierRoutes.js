const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { body } = require('express-validator');

const supplierValidator = [
  body('companyName').trim().notEmpty().withMessage('Company name is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
];

router.use(protect, requireOrg);

router.get('/', supplierController.getSuppliers);
router.get('/:id', supplierController.getSupplierById);
router.post('/', authorize('admin', 'manager'), supplierValidator, validateRequest, supplierController.createSupplier);
router.put('/:id', authorize('admin', 'manager'), supplierController.updateSupplier);
router.delete('/:id', authorize('admin'), supplierController.deleteSupplier);

module.exports = router;
