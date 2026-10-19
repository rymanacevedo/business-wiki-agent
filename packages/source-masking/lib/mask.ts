// SSN: 3-2-4 digits with dashes, not part of a longer number.
const SSN = /(?<![\d-])\d{3}-\d{2}-(\d{4})(?![\d-])/g;

// Account, card, and routing numbers: 8 to 19 digits, contiguous or in
// space/dash-separated groups of four (card style). Shorter numbers (EIN
// halves, invoice numbers, last-four references, amounts) are left alone.
const FINANCIAL = /(?<![\d-])(?:\d{8,19}|\d{4}(?:[ -]\d{4}){2,3})(?![\d-])/g;

const maskFinancial = (match: string) =>
  `****${match.replace(/\D/g, "").slice(-4)}`;

export function mask(text: string): string {
  return text.replace(SSN, "***-**-$1").replace(FINANCIAL, maskFinancial);
}

export type MaskedValue = {
  value: string;
  masked: string;
  kind: "ssn" | "account";
};

/** Every value `mask` replaces, in the order `mask` replaces them. */
export function maskedValues(text: string): MaskedValue[] {
  const ssns = [...text.matchAll(SSN)].map((m): MaskedValue => ({
    value: m[0],
    masked: `***-**-${m[1]}`,
    kind: "ssn",
  }));
  const rest = text.replace(SSN, "***-**-$1");
  const accounts = [...rest.matchAll(FINANCIAL)].map((m): MaskedValue => ({
    value: m[0],
    masked: maskFinancial(m[0]),
    kind: "account",
  }));
  return [...ssns, ...accounts];
}
