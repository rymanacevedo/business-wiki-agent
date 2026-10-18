// SSN: 3-2-4 digits with dashes, not part of a longer number.
const SSN = /(?<![\d-])\d{3}-\d{2}-(\d{4})(?![\d-])/g;

// Account, card, and routing numbers: 8 to 19 digits, contiguous or in
// space/dash-separated groups of four (card style). Shorter numbers (EIN
// halves, invoice numbers, last-four references, amounts) are left alone.
const FINANCIAL = /(?<![\d-])(?:\d{8,19}|\d{4}(?:[ -]\d{4}){2,3})(?![\d-])/g;

export function mask(text: string): string {
  return text
    .replace(SSN, "***-**-$1")
    .replace(FINANCIAL, (match) => `****${match.replace(/\D/g, "").slice(-4)}`);
}
