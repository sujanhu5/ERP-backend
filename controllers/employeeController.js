const EmployeeModel = require('../models/employeeModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const getEmployees = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { rows, total } = await EmployeeModel.findAll(req.user.organizationId, {
    limit, offset, search: req.query.search, department: req.query.department, status: req.query.status,
  });
  res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await EmployeeModel.findById(req.params.id, req.user.organizationId);
  if (!employee) throw new ApiError(404, 'Employee not found.');
  const leaves = await EmployeeModel.getLeaves(req.params.id, req.user.organizationId);
  res.json({ success: true, data: { ...employee, leaves } });
});

const createEmployee = asyncHandler(async (req, res) => {
  const employee = await EmployeeModel.create(req.user.organizationId, req.body);
  await logAudit(req.user.id, 'CREATE_EMPLOYEE', 'employees', employee.id, { name: employee.name }, null, req.user.organizationId);
  res.status(201).json({ success: true, data: employee });
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await EmployeeModel.findById(req.params.id, req.user.organizationId);
  if (!employee) throw new ApiError(404, 'Employee not found.');
  const updated = await EmployeeModel.update(req.params.id, req.body, req.user.organizationId);
  await logAudit(req.user.id, 'UPDATE_EMPLOYEE', 'employees', employee.id, req.body, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await EmployeeModel.findById(req.params.id, req.user.organizationId);
  if (!employee) throw new ApiError(404, 'Employee not found.');
  await EmployeeModel.delete(req.params.id, req.user.organizationId);
  await logAudit(req.user.id, 'DELETE_EMPLOYEE', 'employees', employee.id, { name: employee.name }, null, req.user.organizationId);
  res.json({ success: true, message: 'Employee deleted successfully.' });
});

const markAttendance = asyncHandler(async (req, res) => {
  const { date, status, checkIn, checkOut } = req.body;
  const record = await EmployeeModel.markAttendance(
    req.params.id, req.user.organizationId, date || new Date(), status, checkIn, checkOut
  );
  res.json({ success: true, data: record });
});

const getAttendance = asyncHandler(async (req, res) => {
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const records = await EmployeeModel.getAttendance(req.params.id, req.user.organizationId, month, year);
  res.json({ success: true, data: records });
});

const requestLeave = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason } = req.body;
  const leave = await EmployeeModel.requestLeave(req.params.id, req.user.organizationId, startDate, endDate, reason);
  res.status(201).json({ success: true, data: leave });
});

const updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Invalid leave status.');
  }
  const leave = await EmployeeModel.updateLeaveStatus(req.params.leaveId, req.user.organizationId, status);
  res.json({ success: true, data: leave });
});

module.exports = {
  getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee,
  markAttendance, getAttendance, requestLeave, updateLeaveStatus,
};
