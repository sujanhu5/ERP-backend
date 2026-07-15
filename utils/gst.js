/**
 * GST computation for Indian invoices.
 *
 * Place-of-supply rule: when the customer's state matches the seller's state,
 * the transaction is intra-state and GST splits into equal CGST + SGST halves.
 * When the states differ (or the customer state is unknown but the caller marks
 * it inter-state), the full rate is charged as IGST instead.
 */

/**
 * @param {Array} lines  [{ lineSubtotal, gstPercent }]
 * @param {boolean} interState  true => IGST, false => CGST+SGST
 * @returns {{ cgst:number, sgst:number, igst:number, gstTotal:number }}
 */
function computeGst(lines, interState) {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const { lineSubtotal, gstPercent } of lines) {
    const tax = (Number(lineSubtotal) * Number(gstPercent || 0)) / 100;
    if (interState) {
      igst += tax;
    } else {
      cgst += tax / 2;
      sgst += tax / 2;
    }
  }

  const round = (n) => Math.round(n * 100) / 100;
  cgst = round(cgst);
  sgst = round(sgst);
  igst = round(igst);
  return { cgst, sgst, igst, gstTotal: round(cgst + sgst + igst) };
}

/** Normalises a state string for comparison ("Tamil Nadu " -> "tamilnadu"). */
function normaliseState(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Decides intra vs inter-state from seller + customer state.
 * Defaults to intra-state (CGST+SGST) when either side is unknown, which is the
 * safe assumption for a local sale.
 */
function isInterState(sellerState, customerState) {
  const a = normaliseState(sellerState);
  const b = normaliseState(customerState);
  if (!a || !b) return false;
  return a !== b;
}

module.exports = { computeGst, isInterState, normaliseState };
