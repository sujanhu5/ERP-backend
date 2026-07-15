const { query, getClient } = require('../config/db');
const { computeGst, isInterState } = require('../utils/gst');

const InvoiceModel = {
  /**
   * Generates the next invoice number using the org's invoice prefix + zero-padded sequence.
   * Sequence and prefix are both scoped to the organization.
   */
  async generateInvoiceNumber(client, organizationId) {
    const settingsRes = await client.query(
      'SELECT invoice_prefix FROM organization_settings WHERE organization_id = $1',
      [organizationId]
    );
    const prefix = settingsRes.rows[0]?.invoice_prefix || 'INV';
    const countRes = await client.query('SELECT COUNT(*) FROM invoices WHERE organization_id = $1', [organizationId]);
    const nextSeq = parseInt(countRes.rows[0].count, 10) + 1;
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(nextSeq).padStart(5, '0')}`;
  },

  /**
   * Creates an invoice + invoice items in a single DB transaction,
   * decrements product stock, logs inventory movement, and updates
   * customer outstanding balance if payment is partial/unpaid.
   *
   * items: [{ productId, quantity, unitPrice, gstPercent }]
   */
  async createWithItems(organizationId, {
    customerId, createdBy, items, discountAmount = 0,
    paymentMethod, paymentStatus, amountPaid = 0, notes,
  }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Validate stock availability first
      for (const item of items) {
        const stockRes = await client.query(
          'SELECT current_stock, name, selling_price, gst_percent FROM products WHERE id = $1 AND organization_id = $2 FOR UPDATE',
          [item.productId, organizationId]
        );
        if (stockRes.rows.length === 0) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (stockRes.rows[0].current_stock < item.quantity) {
          throw new Error(`Insufficient stock for ${stockRes.rows[0].name}. Available: ${stockRes.rows[0].current_stock}`);
        }
      }

      let subtotal = 0;
      const lineItems = [];
      const gstLines = [];

      for (const item of items) {
        const productRes = await client.query(
          'SELECT * FROM products WHERE id = $1 AND organization_id = $2',
          [item.productId, organizationId]
        );
        const product = productRes.rows[0];
        const unitPrice = item.unitPrice ?? product.selling_price;
        const gstPercent = item.gstPercent ?? product.gst_percent;
        const lineSubtotal = unitPrice * item.quantity;
        const lineGst = (lineSubtotal * gstPercent) / 100;
        const lineTotal = lineSubtotal + lineGst;

        subtotal += lineSubtotal;
        gstLines.push({ lineSubtotal, gstPercent });

        lineItems.push({
          productId: item.productId,
          productName: product.name,
          hsnCode: product.hsn_code,
          quantity: item.quantity,
          unitPrice,
          gstPercent,
          lineTotal,
        });
      }

      // Determine intra vs inter-state from seller (org settings) + customer state,
      // then split GST into CGST/SGST or IGST accordingly.
      const sellerRes = await client.query(
        'SELECT state FROM organization_settings WHERE organization_id = $1',
        [organizationId]
      );
      const sellerState = sellerRes.rows[0]?.state || null;
      let customerState = null;
      let placeOfSupply = null;
      if (customerId) {
        const custRes = await client.query(
          'SELECT address, gstin FROM customers WHERE id = $1 AND organization_id = $2',
          [customerId, organizationId]
        );
        // GSTIN's first two digits are the state code; fall back to the address text.
        customerState = custRes.rows[0]?.address || null;
        placeOfSupply = customerState;
      }

      const interState = isInterState(sellerState, customerState);
      const { cgst, sgst, igst, gstTotal } = computeGst(gstLines, interState);

      const totalAmount = subtotal + gstTotal - discountAmount;
      const invoiceNumber = await this.generateInvoiceNumber(client, organizationId);

      const invoiceRes = await client.query(
        `INSERT INTO invoices
          (organization_id, invoice_number, customer_id, created_by, subtotal, discount_amount,
           cgst_amount, sgst_amount, igst_amount, gst_amount,
           total_amount, amount_paid, payment_method, payment_status, place_of_supply, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [organizationId, invoiceNumber, customerId || null, createdBy || null, subtotal, discountAmount,
          cgst, sgst, igst, gstTotal, totalAmount, amountPaid, paymentMethod, paymentStatus,
          placeOfSupply || sellerState || null, notes || null]
      );
      const invoice = invoiceRes.rows[0];

      for (const li of lineItems) {
        await client.query(
          `INSERT INTO invoice_items
            (organization_id, invoice_id, product_id, product_name, hsn_code, quantity, unit_price, gst_percent, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [organizationId, invoice.id, li.productId, li.productName, li.hsnCode || null, li.quantity, li.unitPrice, li.gstPercent, li.lineTotal]
        );

        // Reduce stock
        await client.query(
          'UPDATE products SET current_stock = current_stock - $1 WHERE id = $2 AND organization_id = $3',
          [li.quantity, li.productId, organizationId]
        );

        // Inventory log
        await client.query(
          `INSERT INTO inventory_logs (organization_id, product_id, action, quantity_change, reference_id, note, performed_by)
           VALUES ($1, $2, 'sale_out', $3, $4, $5, $6)`,
          [organizationId, li.productId, -li.quantity, invoice.id, `Sold via invoice ${invoiceNumber}`, createdBy || null]
        );
      }

      // Sales aggregate row for fast reporting
      await client.query(
        'INSERT INTO sales (organization_id, invoice_id, sale_date, total_amount) VALUES ($1, $2, CURRENT_DATE, $3)',
        [organizationId, invoice.id, totalAmount]
      );

      // Record initial payment if any
      if (amountPaid > 0) {
        await client.query(
          'INSERT INTO payments (organization_id, invoice_id, amount, method) VALUES ($1,$2,$3,$4)',
          [organizationId, invoice.id, amountPaid, paymentMethod]
        );
      }

      // Update customer outstanding balance
      if (customerId) {
        const balanceDelta = totalAmount - amountPaid;
        if (balanceDelta !== 0) {
          await client.query(
            'UPDATE customers SET outstanding_balance = outstanding_balance + $1 WHERE id = $2 AND organization_id = $3',
            [balanceDelta, customerId, organizationId]
          );
        }
      }

      await client.query('COMMIT');
      return { ...invoice, items: lineItems };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async findAll(organizationId, { limit, offset, search, paymentStatus, fromDate, toDate }) {
    const conditions = ['i.organization_id = $1'];
    const params = [organizationId];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      conditions.push(`i.payment_status = $${params.length}`);
    }
    if (fromDate) {
      params.push(fromDate);
      conditions.push(`i.created_at >= $${params.length}`);
    }
    if (toDate) {
      params.push(toDate);
      conditions.push(`i.created_at <= $${params.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const res = await query(
      `SELECT i.*, c.name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const countRes = await query(
      `SELECT COUNT(*) FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ${where}`,
      countParams
    );
    return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async findById(id, organizationId) {
    const invoiceRes = await query(
      `SELECT i.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
              c.address AS customer_address, c.gstin AS customer_gstin
       FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = $1 AND i.organization_id = $2`,
      [id, organizationId]
    );
    if (invoiceRes.rows.length === 0) return null;
    const itemsRes = await query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
    return { ...invoiceRes.rows[0], items: itemsRes.rows };
  },

  async addPayment(invoiceId, organizationId, amount, method, notes) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO payments (organization_id, invoice_id, amount, method, notes) VALUES ($1,$2,$3,$4,$5)',
        [organizationId, invoiceId, amount, method, notes || null]
      );
      const invoiceRes = await client.query(
        'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
        [invoiceId, organizationId]
      );
      const invoice = invoiceRes.rows[0];
      const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(amount);
      let newStatus = 'partial';
      if (newAmountPaid >= parseFloat(invoice.total_amount)) newStatus = 'paid';
      if (newAmountPaid <= 0) newStatus = 'unpaid';

      await client.query(
        'UPDATE invoices SET amount_paid = $1, payment_status = $2 WHERE id = $3 AND organization_id = $4',
        [newAmountPaid, newStatus, invoiceId, organizationId]
      );

      if (invoice.customer_id) {
        await client.query(
          'UPDATE customers SET outstanding_balance = outstanding_balance - $1 WHERE id = $2 AND organization_id = $3',
          [amount, invoice.customer_id, organizationId]
        );
      }
      await client.query('COMMIT');
      return this.findById(invoiceId, organizationId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = InvoiceModel;
