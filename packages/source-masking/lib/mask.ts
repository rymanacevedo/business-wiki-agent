/*
 * Masking hides exactly four classes of number: SSNs, and account, card, and
 * routing numbers. Everything else stays clear, including numbers that look
 * alike: phones, the EIN, dates, amounts, ZIP codes, and invoice, policy,
 * permit, and license numbers. A number is masked when one of these rules
 * finds it, tried in this order (an earlier rule's match wins):
 *
 * 1. SSN, by shape: `NNN-NN-NNNN`, not part of a longer number.
 * 2. SSN, by label: 9 digits (contiguous or `NNN NN NNNN`, the groups
 *    joined as in rule 3) right after "SSN" or "Social security number".
 * 3. Account, card, or routing number, by label: 6 to 19 digits, contiguous,
 *    joined by dashes, in groups of 2 to 6 (as banks print "021 000 021"), or
 *    in a card grouping (rule 4), right after a label naming one ("Account",
 *    "Acct", "A/C", "Routing", "ABA", "RTN", "Card", or a card brand, alone or
 *    joined to another by "/" or "&", as in "ABA/Routing" or "Routing/ACH"),
 *    optionally followed by "number", "No.", or "#" and any of ":", "#", "|".
 *    Groups are joined by a dash (whitespace around it allowed) or by any run
 *    of horizontal whitespace: spaces, tabs, NBSP, thin and other Unicode
 *    spaces. Never by a line break, and never on to a following date or
 *    phone (`2026-09-01`, `10-01-2026`, `555-014-2290`): that is the next
 *    field. Shorter numbers after a label are last-four references
 *    ("Account: 6615") and stay clear; so does "card ending 8820".
 * 4. Card number, by shape: a common card grouping (4-4-4-4, 4-4-4-4-3,
 *    4-6-5, 4-6-4), its groups joined as in rule 3. No other number a small
 *    business keeps is printed that way.
 * 5. Card number, by checksum: 13 to 19 contiguous digits that pass the
 *    Luhn check every payment card satisfies. A contiguous run is ambiguous
 *    (order or tracking numbers), so the checksum decides.
 *
 * Phones are never masked: no rule takes a 10- or 11-digit number without an
 * account label, and a number led by `+` (an international phone) is skipped
 * by rules 4 and 5. The EIN (`NN-NNNNNNN`) fits no rule. Masked forms keep
 * the last four: `***-**-NNNN` for an SSN, `****NNNN` for the rest.
 */

export type MaskedValue = {
  value: string;
  masked: string;
  kind: "ssn" | "account";
};

type Found = MaskedValue & { start: number; end: number };

// A number's edges: not glued to more digits, letters, or a decimal part.
const START = String.raw`(?<![\w+.,/-])`;
const END = String.raw`(?![\w/]|[.,-]\d)`;

const SSN_SHAPE = new RegExp(`${START}\\d{3}-\\d{2}-\\d{4}${END}`, "g");

// Horizontal whitespace of any kind: tabs, spaces, and Unicode spaces such as
// NBSP and thin space. Never a line break, so a number cannot run on to the
// next line.
const H = String.raw`[^\S\n\r\v\f\u2028\u2029]`;

// What joins two groups of a number: a dash, with or without whitespace
// around it, or a run of horizontal whitespace.
const SEP = String.raw`(?:${H}*-${H}*|${H}+)`;

const SSN_LABEL = new RegExp(
  String.raw`\b(?:SSN|social security(?: number| no\.?)?)\s*[:#]?\s*(\d{3}${SEP}\d{2}${SEP}\d{4}|\d{9})${END}`,
  "gi"
);

// The card groupings rule 4 knows, each pair of groups joined by SEP.
const CARD_GROUPING = [
  String.raw`\d{4}${SEP}\d{4}${SEP}\d{4}${SEP}\d{4}(?:${SEP}\d{3})?`,
  String.raw`\d{4}${SEP}\d{6}${SEP}\d{4,5}`,
].join("|");

const LABEL = String.raw`(?:account|acct|a/c|routing|aba|rtn|card|visa|mastercard|amex|american express|discover)`;

// The start of another field after a labelled number: a date or a phone.
const NEXT_FIELD = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}-\d{4}|\d{3}-\d{3}-\d{4})(?!\d)`;

// A bank's grouping after a label, as in "021 000 021" or "1234 5678 9012":
// groups of 2 to 6 digits, each pair joined by SEP, stopping where a date or
// phone begins.
const GROUPED = String.raw`\d{2,6}(?:${SEP}(?!${NEXT_FIELD})\d{2,6})+`;

// A labelled number joined only by dashes, groups of any length; a dash with
// whitespace around it does not join a following date or phone.
const DASHED = String.raw`\d+(?:(?:-|${H}*-${H}*(?!${NEXT_FIELD}))\d+)*`;

const ACCOUNT_LABEL = new RegExp(
  String.raw`\b${LABEL}\.?(?:\s*[/&]\s*(?:${LABEL}|ach|wire)\.?)*` +
    String.raw`(?:\s*(?:number|num|no\.?|#))?(?:\s*[:#|])*\s*` +
    `(${CARD_GROUPING}|${GROUPED}|${DASHED})${END}`,
  "gi"
);

const CARD_GROUPS = new RegExp(`${START}(?:${CARD_GROUPING})${END}`, "g");

const CARD_DIGITS = new RegExp(`${START}\\d{13,19}${END}`, "g");

const digits = (value: string) => value.replace(/\D/g, "");

const lastFour = (value: string) => digits(value).slice(-4);

/** The Luhn checksum every payment card number satisfies. */
function luhn(number: string): boolean {
  let sum = 0;
  [...number].reverse().forEach((c, i) => {
    let d = Number(c);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  });
  return sum % 10 === 0;
}

/** Every sensitive number in `text`, in text order, none overlapping. */
function find(text: string): Found[] {
  const found: Found[] = [];
  const take = (
    start: number,
    value: string,
    kind: MaskedValue["kind"]
  ): void => {
    const end = start + value.length;
    if (found.some((f) => start < f.end && f.start < end)) return;
    const masked =
      kind === "ssn" ? `***-**-${lastFour(value)}` : `****${lastFour(value)}`;
    found.push({ value, masked, kind, start, end });
  };
  // The captured number sits at the end of a labelled match.
  const tail = (m: RegExpMatchArray) =>
    (m.index ?? 0) + m[0].length - m[1].length;

  for (const m of text.matchAll(SSN_SHAPE)) take(m.index ?? 0, m[0], "ssn");
  for (const m of text.matchAll(SSN_LABEL)) take(tail(m), m[1], "ssn");
  for (const m of text.matchAll(ACCOUNT_LABEL)) {
    const n = digits(m[1]).length;
    if (n >= 6 && n <= 19) take(tail(m), m[1], "account");
  }
  for (const m of text.matchAll(CARD_GROUPS))
    take(m.index ?? 0, m[0], "account");
  for (const m of text.matchAll(CARD_DIGITS))
    if (luhn(m[0])) take(m.index ?? 0, m[0], "account");

  return found.sort((a, b) => a.start - b.start);
}

export function mask(text: string): string {
  let out = "";
  let at = 0;
  for (const f of find(text)) {
    out += text.slice(at, f.start) + f.masked;
    at = f.end;
  }
  return out + text.slice(at);
}

/** Every value `mask` replaces, in text order. */
export function maskedValues(text: string): MaskedValue[] {
  return find(text).map(({ value, masked, kind }) => ({ value, masked, kind }));
}
