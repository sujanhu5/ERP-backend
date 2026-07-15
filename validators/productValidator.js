const { body } = require('express-validator');

const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('purchasePrice').isFloat({ min: 0 }).withMessage('Purchase price must be a positive number'),
  body('sellingPrice').isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
  body('currentStock').optional().isInt({ min: 0 }).withMessage('Current stock must be a positive integer'),
  body('minimumStock').optional().isInt({ min: 0 }).withMessage('Minimum stock must be a positive integer'),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('GST must be between 0 and 100'),
];

module.exports = { productValidator };
