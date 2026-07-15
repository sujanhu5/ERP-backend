const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { body } = require('express-validator');

const invoiceValidator = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('productId is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
];

router.use(protect, requireOrg);

router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.get('/:id/pdf', invoiceController.downloadInvoicePDF);
router.post('/', authorize('admin', 'manager'), invoiceValidator, validateRequest, invoiceController.createInvoice);
router.post('/:id/payments', authorize('admin', 'manager'), invoiceController.addPayment);

module.exports = router;
