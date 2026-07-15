const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireOrg } = require('../middleware/tenantMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { body } = require('express-validator');

const employeeValidator = [
  body('name').trim().notEmpty().withMessage('Employee name is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('salary').optional().isFloat({ min: 0 }).withMessage('Salary must be a positive number'),
];

router.use(protect, requireOrg);

router.get('/', employeeController.getEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', authorize('admin', 'manager'), employeeValidator, validateRequest, employeeController.createEmployee);
router.put('/:id', authorize('admin', 'manager'), employeeController.updateEmployee);
router.delete('/:id', authorize('admin'), employeeController.deleteEmployee);

// Attendance
router.post('/:id/attendance', authorize('admin', 'manager'), employeeController.markAttendance);
router.get('/:id/attendance', employeeController.getAttendance);

// Leaves
router.post('/:id/leaves', employeeController.requestLeave);
router.put('/:id/leaves/:leaveId', authorize('admin', 'manager'), employeeController.updateLeaveStatus);

module.exports = router;
