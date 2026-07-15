const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { amountInWords } = require('./amountInWords');
const { createClient } = require('@supabase/supabase-js');

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

const INK = '#1A1A1A';
const MUTED = '#555555';
const LINE = '#DADEE5';
const BRAND = '#21629F';
const BRAND_LIGHT = '#EAF2FB';

const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Generates a professional Indian GST tax invoice and saves it under
 * uploads/{organizationId}/invoices/. Returns the relative URL.
 */
function generateInvoicePDF(invoice, company, organizationId) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      // stream to disk in dev if no Supabase; in prod will upload to Supabase
      let localStream;
      if (!supabase) {
        const dir = path.join(process.env.UPLOAD_DIR || 'uploads', String(organizationId), 'invoices');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, `${invoice.invoice_number}.pdf`);
        localStream = fs.createWriteStream(filePath);
        doc.pipe(localStream);
      }

      const L = 40;              // left margin
      const R = 555;             // right edge
      const W = R - L;
      const interState = Number(invoice.igst_amount) > 0;

      // ---- Title bar ----
      doc.rect(L, 40, W, 26).fill(BRAND);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13)
        .text('TAX INVOICE', L, 46, { width: W, align: 'center' });

      // ---- Seller block ----
      let y = 78;
      const addr = [company?.building, company?.area, company?.city, company?.district, company?.state, company?.pincode]
        .filter(Boolean).join(', ');
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
        .text(company?.company_name || 'Company Name', L, y);
      y += 20;
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
      if (addr) { doc.text(addr, L, y, { width: 300 }); y += 12; }
      doc.text(`GSTIN: ${company?.gstin || '-'}    PAN: ${company?.pan || '-'}`, L, y); y += 11;
      doc.text(`${company?.email || ''}${company?.phone ? '   ' + company.phone : ''}`, L, y);

      // ---- Invoice meta (right) ----
      const metaX = 360, metaW = R - metaX;
      let my = 78;
      const meta = [
        ['Invoice No', invoice.invoice_number],
        ['Date', new Date(invoice.created_at).toLocaleDateString('en-IN')],
        ['Place of Supply', invoice.place_of_supply || company?.state || '-'],
        ['Supply Type', interState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'],
      ];
      doc.fontSize(8.5);
      meta.forEach(([k, v]) => {
        doc.font('Helvetica').fillColor(MUTED).text(`${k}:`, metaX, my, { width: 90 });
        doc.font('Helvetica-Bold').fillColor(INK).text(String(v), metaX + 92, my, { width: metaW - 92, align: 'right' });
        my += 13;
      });

      // ---- Bill To ----
      y = 150;
      doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND).text('BILL TO', L, y);
      y += 14;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
        .text(invoice.customer_name || 'Walk-in Customer', L, y);
      y += 14;
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
      if (invoice.customer_address) { doc.text(invoice.customer_address, L, y, { width: 320 }); y += 11; }
      const custBits = [invoice.customer_phone, invoice.customer_gstin ? `GSTIN: ${invoice.customer_gstin}` : null]
        .filter(Boolean).join('    ');
      if (custBits) doc.text(custBits, L, y);

      // ---- Items table ----
      let ty = 210;
      const cols = interState
        ? [
            { key: 'sn', label: '#', x: L, w: 22, align: 'left' },
            { key: 'name', label: 'Item', x: 62, w: 150, align: 'left' },
            { key: 'hsn', label: 'HSN/SAC', x: 212, w: 55, align: 'left' },
            { key: 'qty', label: 'Qty', x: 267, w: 32, align: 'right' },
            { key: 'rate', label: 'Rate', x: 299, w: 62, align: 'right' },
            { key: 'taxable', label: 'Taxable', x: 361, w: 66, align: 'right' },
            { key: 'igst', label: 'IGST', x: 427, w: 58, align: 'right' },
            { key: 'total', label: 'Amount', x: 485, w: 70, align: 'right' },
          ]
        : [
            { key: 'sn', label: '#', x: L, w: 20, align: 'left' },
            { key: 'name', label: 'Item', x: 60, w: 132, align: 'left' },
            { key: 'hsn', label: 'HSN/SAC', x: 192, w: 50, align: 'left' },
            { key: 'qty', label: 'Qty', x: 242, w: 28, align: 'right' },
            { key: 'rate', label: 'Rate', x: 270, w: 55, align: 'right' },
            { key: 'taxable', label: 'Taxable', x: 325, w: 58, align: 'right' },
            { key: 'cgst', label: 'CGST', x: 383, w: 55, align: 'right' },
            { key: 'sgst', label: 'SGST', x: 438, w: 55, align: 'right' },
            { key: 'total', label: 'Amount', x: 493, w: 62, align: 'right' },
          ];

      // header row
      doc.rect(L, ty, W, 18).fill(BRAND_LIGHT);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND);
      cols.forEach((c) => doc.text(c.label, c.x + 2, ty + 5.5, { width: c.w - 4, align: c.align }));
      ty += 18;

      doc.font('Helvetica').fontSize(8).fillColor(INK);
      (invoice.items || []).forEach((it, i) => {
        const taxable = Number(it.unit_price) * it.quantity;
        const tax = (taxable * Number(it.gst_percent)) / 100;
        const rowH = 16;
        if (i % 2 === 1) doc.rect(L, ty, W, rowH).fill('#FAFBFC');
        doc.fillColor(INK).fontSize(8);

        const values = {
          sn: String(i + 1),
          name: it.product_name,
          hsn: it.hsn_code || '-',
          qty: String(it.quantity),
          rate: rs(it.unit_price),
          taxable: rs(taxable),
          cgst: `${rs(tax / 2)}\n${Number(it.gst_percent) / 2}%`,
          sgst: `${rs(tax / 2)}\n${Number(it.gst_percent) / 2}%`,
          igst: `${rs(tax)}\n${it.gst_percent}%`,
          total: rs(taxable + tax),
        };
        cols.forEach((c) => {
          doc.text(values[c.key], c.x + 2, ty + 4, { width: c.w - 4, align: c.align, lineGap: -1 });
        });
        ty += rowH;
      });

      doc.moveTo(L, ty).lineTo(R, ty).strokeColor(LINE).stroke();

      // ---- Totals + amount in words ----
      const totY = ty + 12;
      // Left: amount in words
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('Amount in Words', L, totY);
      doc.font('Helvetica').fontSize(8.5).fillColor(INK)
        .text(amountInWords(invoice.total_amount), L, totY + 13, { width: 300 });

      // Right: totals table
      const tX = 360;
      let ry = totY;
      const rows = [
        ['Subtotal', rs(invoice.subtotal)],
        ['Discount', `- ${rs(invoice.discount_amount)}`],
      ];
      if (interState) {
        rows.push(['IGST', rs(invoice.igst_amount)]);
      } else {
        rows.push(['CGST', rs(invoice.cgst_amount)]);
        rows.push(['SGST', rs(invoice.sgst_amount)]);
      }
      doc.fontSize(8.5);
      rows.forEach(([k, v]) => {
        doc.font('Helvetica').fillColor(MUTED).text(k, tX, ry, { width: 90 });
        doc.font('Helvetica').fillColor(INK).text(v, tX + 90, ry, { width: R - tX - 90, align: 'right' });
        ry += 14;
      });
      // grand total band
      doc.rect(tX, ry + 2, R - tX, 20).fill(BRAND);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff')
        .text('Grand Total', tX + 6, ry + 8, { width: 90 })
        .text(rs(invoice.total_amount), tX + 90, ry + 8, { width: R - tX - 96, align: 'right' });
      ry += 30;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('Amount Paid', tX, ry, { width: 90 })
        .fillColor(INK).text(rs(invoice.amount_paid), tX + 90, ry, { width: R - tX - 90, align: 'right' });
      ry += 13;
      const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
      doc.font('Helvetica-Bold').fillColor(balance > 0 ? '#B45309' : '#0E7C4A')
        .text('Balance Due', tX, ry, { width: 90 })
        .text(rs(balance), tX + 90, ry, { width: R - tX - 90, align: 'right' });

      // ---- Footer: QR placeholder, terms, signature ----
      const fy = Math.max(ry + 40, 690);
      doc.moveTo(L, fy).lineTo(R, fy).strokeColor(LINE).stroke();

      // QR placeholder
      doc.rect(L, fy + 12, 58, 58).strokeColor(LINE).stroke();
      doc.font('Helvetica').fontSize(6).fillColor(MUTED)
        .text('QR', L, fy + 37, { width: 58, align: 'center' });
      doc.fontSize(7).fillColor(MUTED).text('Scan to verify', L, fy + 74, { width: 58, align: 'center' });

      // Terms
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND).text('Terms & Conditions', 120, fy + 12);
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
        'Goods once sold will not be taken back. Interest @18% p.a. is charged on overdue bills. Subject to local jurisdiction. This is a computer-generated invoice.',
        120, fy + 25, { width: 250 }
      );

      // Signature
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(`For ${company?.company_name || 'Company'}`, 400, fy + 20, { width: 155, align: 'right' });
      doc.moveTo(430, fy + 58).lineTo(R, fy + 58).strokeColor(LINE).stroke();
      doc.text('Authorized Signatory', 400, fy + 62, { width: 155, align: 'right' });

      doc.fontSize(7).fillColor('#999')
        .text('Thank you for your business.', L, 800, { width: W, align: 'center' });

      doc.end();
      doc.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        if (supabase) {
          const storagePath = `${organizationId}/invoices/${invoice.invoice_number}.pdf`;
          const { error } = await supabase.storage
            .from('erp-uploads')
            .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
          if (error) return reject(new Error(error.message));
          const { data } = supabase.storage.from('erp-uploads').getPublicUrl(storagePath);
          resolve(data.publicUrl);
        } else if (localStream) {
          localStream.on('error', reject);
        }
      });
      if (!supabase && localStream) {
        localStream.on('finish', () =>
          resolve(`/uploads/${organizationId}/invoices/${invoice.invoice_number}.pdf`),
        );
        localStream.on('error', reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePDF };
