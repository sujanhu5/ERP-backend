const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  signupValidator, registerValidator, loginValidator, changePasswordValidator,
} = require('../validators/authValidator');

// Public
router.post('/signup', authLimiter, signupValidator, validateRequest, authController.signup);
router.post('/login', authLimiter, loginValidator, validateRequest, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Admin-only user creation (Admin creates Manager/Employee accounts within their org)
router.post(
  '/register',
  protect,
  requireOrg,
  authorize('admin'),
  registerValidator,
  validateRequest,
  authController.register
);

// Authenticated
router.get('/me', protect, authController.getMe);
router.put('/change-password', protect, changePasswordValidator, validateRequest, authController.changePassword);

module.exports = router;
