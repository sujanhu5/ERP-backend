const InvoiceModel = require('../models/invoiceModel');
const { query } = require('../config/db');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { logAudit } = require('../utils/auditLogger');

const getInvoices = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { rows, total } = await InvoiceModel.findAll(req.user.organizationId, {
    limit, offset, search: req.query.search, paymentStatus: req.query.paymentStatus,
    fromDate: req.query.fromDate, toDate: req.query.toDate,
  });
  res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const getInvoiceById = asyncHandler(async (req, res) => {
  const invoice = await InvoiceModel.findById(req.params.id, req.user.organizationId);
  if (!invoice) throw new ApiError(404, 'Invoice not found.');
  res.json({ success: true, data: invoice });
});

/**
 * @route POST /api/invoices
 * @desc  Creates invoice, auto-reduces stock, generates PDF.
 * body: { customerId, items: [{productId, quantity, unitPrice?, gstPercent?}], discountAmount, paymentMethod, paymentStatus, amountPaid, notes }
 */
const createInvoice = asyncHandler(async (req, res) => {
  const { customerId, items, discountAmount, paymentMethod, paymentStatus, amountPaid, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'At least one invoice item is required.');
  }

  const invoice = await InvoiceModel.createWithItems(req.user.organizationId, {
    customerId,
    createdBy: req.user.id,
    items,
    discountAmount: discountAmount || 0,
    paymentMethod: paymentMethod || 'cash',
    paymentStatus: paymentStatus || 'unpaid',
    amountPaid: amountPaid || 0,
    notes,
  });

  // Generate PDF
  const settingsRes = await query('SELECT * FROM organization_settings WHERE organization_id = $1', [req.user.organizationId]);
  const company = settingsRes.rows[0];
  const fullInvoice = await InvoiceModel.findById(invoice.id, req.user.organizationId);
  const pdfPath = await generateInvoicePDF(fullInvoice, company, req.user.organizationId);
  await query('UPDATE invoices SET pdf_url = $1 WHERE id = $2 AND organization_id = $3', [pdfPath, invoice.id, req.user.organizationId]);

  await logAudit(req.user.id, 'CREATE_INVOICE', 'invoices', invoice.id, { invoiceNumber: invoice.invoice_number }, null, req.user.organizationId);

  res.status(201).json({ success: true, data: { ...fullInvoice, pdf_url: pdfPath } });
});

/**
 * @route POST /api/invoices/:id/payments
 */
const addPayment = asyncHandler(async (req, res) => {
  const { amount, method, notes } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero.');

  const invoice = await InvoiceModel.findById(req.params.id, req.user.organizationId);
  if (!invoice) throw new ApiError(404, 'Invoice not found.');

  const updated = await InvoiceModel.addPayment(req.params.id, req.user.organizationId, amount, method || 'cash', notes);
  await logAudit(req.user.id, 'ADD_PAYMENT', 'invoices', req.params.id, { amount }, null, req.user.organizationId);
  res.json({ success: true, data: updated });
});

const downloadInvoicePDF = asyncHandler(async (req, res) => {
  const invoice = await InvoiceModel.findById(req.params.id, req.user.organizationId);
  if (!invoice || !invoice.pdf_url) throw new ApiError(404, 'Invoice PDF not found.');
  res.redirect(invoice.pdf_url);
});

module.exports = { getInvoices, getInvoiceById, createInvoice, addPayment, downloadInvoicePDF };
