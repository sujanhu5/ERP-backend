/**
 * Converts a rupee amount into Indian-English words, e.g.
 *   125000.50 -> "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only"
 * Uses the Indian numbering system (thousand, lakh, crore).
 */
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (hundred) out += `${ONES[hundred]} Hundred`;
  if (rest) out += `${hundred ? ' ' : ''}${twoDigits(rest)}`;
  return out;
}

/** Converts an integer (< 1 crore-crore) to Indian-system words. */
function integerToWords(num) {
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;

  const parts = [];
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(' ');
}

function amountInWords(amount) {
  const value = Math.max(0, Number(amount) || 0);
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  let words = `Rupees ${integerToWords(rupees)}`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  words += ' Only';
  return words;
}

module.exports = { amountInWords, integerToWords };
