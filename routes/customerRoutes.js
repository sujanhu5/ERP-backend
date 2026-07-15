const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { body } = require('express-validator');

const customerValidator = [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
];

router.use(protect, requireOrg);

router.get('/', customerController.getCustomers);
router.get('/:id', customerController.getCustomerById);
router.post('/', authorize('admin', 'manager'), customerValidator, validateRequest, customerController.createCustomer);
router.put('/:id', authorize('admin', 'manager'), customerController.updateCustomer);
router.delete('/:id', authorize('admin'), customerController.deleteCustomer);

module.exports = router;
