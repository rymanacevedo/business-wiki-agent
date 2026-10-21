/*
 * Masking is fail-safe: every long number is hidden unless it has a shape
 * that is positively known to be safe. It hides SSNs, and every run of 8 or
 * more digits that is not a phone, the EIN, a date, an amount, a ZIP+4, or a
 * document identifier. A number Masking does not recognise is therefore
 * hidden, not shown. The rules, tried in this order (an earlier rule's match
 * wins and later rules never see its digits):
 *
 * 1. SSN, by shape: `NNN-NN-NNNN`, not part of a longer number.
 * 2. SSN, by label: 9 digits right after "SSN" or "Social security number".
 * 3. An IBAN by shape (`GB29 NWBK 6016 1331 9268 19`, contiguous or in
 *    groups of four); then an account, card, or routing number, by label: 6 to 19 digits right after
 *    a label naming one ("Account", "Acct", "A/C", "Routing", "ABA", "RTN", "IBAN",
 *    "Card", or a card brand, alone or joined to another by "/" or "&", as in
 *    "ABA/Routing" or "Routing/ACH"), optionally followed by "number", "No.",
 *    or "#". This rule is what hides a 6- or 7-digit account number, and an
 *    account number that happens to look like a phone or an EIN.
 * 4. Clear shapes. These stay clear, and their digits never join a run in
 *    rule 5:
 *    - a phone: `NNN-NNN-NNNN`, `1-NNN-NNN-NNNN`, `(NNN) NNN-NNNN`, one led
 *      by `+` (international, up to 15 digits), or 10 or 11 digits in any
 *      grouping right after "Phone", "Tel", "Fax", "Call", "Mobile", "Cell";
 *    - the EIN: `NN-NNNNNNN`, or 9 digits right after "EIN" or "Employer
 *      identification number";
 *    - a date joined by dashes: `YYYY-MM-DD`, `MM-DD-YYYY` (or `DD-MM-YYYY`);
 *    - an amount: led by a currency sign, or with a decimal part
 *      (`1000000.00`); a comma-grouped amount never forms a long run anyway;
 *    - a ZIP+4: `NNNNN-NNNN`.
 * 5. Everything else: a run of 8 or more digits is masked. A run is digits,
 *    contiguous or in groups joined by any horizontal whitespace (spaces,
 *    tabs, NBSP, thin and other Unicode spaces, zero-width spaces, `&nbsp;`
 *    and other space entities), a dash (ASCII, Unicode, or a dash entity),
 *    or Markdown emphasis, code, and escape markers (`*`, `_`, `` ` ``, `~`,
 *    `\\`). Never a
 *    line break. A run longer than 19 digits is masked whole: it may be two
 *    numbers side by side. A number glued to letters (`BL-2026-1093`,
 *    `LLC-2024-0731558`, `INV20931`) is a document identifier, not a run.
 *
 * Labels (rules 2, 3, and the labelled phones and EINs in rule 4) are found
 * through Markdown: emphasis and code markers, link brackets and targets,
 * table pipes, HTML tags and entities, and punctuation such as ":" or "#"
 * may sit around or between the label and the number.
 *
 * Shorter numbers stay clear, so a last-four reference ("Account: 6615",
 * "card ending 8820") is never masked. Masked forms keep the last four:
 * `***-**-NNNN` for an SSN, `****NNNN` for the rest.
 */

export type MaskedValue = {
  value: string;
  masked: string;
  kind: "ssn" | "account";
};

type Found = MaskedValue & { start: number; end: number };

const D = String.raw`\p{Nd}`;

// Horizontal whitespace of any kind, never a line break; zero-width spaces
// and space entities count as whitespace.
const H = String.raw`(?:[^\S\n\r\v\f\u2028\u2029]|[\u200B-\u200D\u2060\uFEFF\u00AD]|&(?:nbsp|ensp|emsp|emsp13|emsp14|numsp|puncsp|thinsp|hairsp|MediumSpace|NoBreak|ZeroWidthSpace|NegativeThinSpace);|&#0*(?:32|160|82(?:0\d|1[01])|8239|8287|12288|8288|65279);|&#[xX]0*(?:20|[aA]0|200[0-9a-fA-F]|202[fF]|205[fF]|2060|3000|[fF][eE][fF][fF]);)`;

// A dash: ASCII, the Unicode hyphens and dashes, minus, or a dash entity.
const DASH = String.raw`(?:[\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]|&(?:hyphen|dash|ndash|mdash|minus);|&#0*(?:45|82(?:0[89]|1[0-3])|8722);|&#[xX]0*(?:2[dD]|201[0-5]|2212);)`;

// Markdown emphasis and code markers, and the backslash of an escape.
const MARK = "[*_`~\\\\]";

const GAP = `(?:${H}|${MARK})`;

// What joins two groups of a run: one dash with gaps around it, or gaps.
const JOIN = `(?:${GAP}*${DASH}${GAP}*|${GAP}+)`;

// A run's edges: not glued to letters or digits (with or without a dash),
// to a decimal part, to "+", "/", or a currency sign, or to a span already
// decided (blanked to \0 below), as in a date range "2026-03-01–2027-02-28".
const START = String.raw`(?<![\p{L}\p{Nd}+/$€£¥\0]|[\p{L}\p{Nd}\0]${DASH}|\p{Nd}[.,])`;
const END = String.raw`(?![\p{L}\p{Nd}/]|[.,]\p{Nd}|${DASH}\p{L})`;

// What may sit between a label and its number in Markdown or a table.
const BETWEEN = String.raw`(?:\s|[*_\x60~:#|.()\[\]]|${DASH}|\]\([^)\n]*\)|<[^>\n]*>|&[A-Za-z]+;|&#[xX]?[0-9a-fA-F]+;|[\u200B-\u200D\u2060\uFEFF])*`;

const flags = "giu";

// A label's edges: not inside a word. Unlike \b, a Markdown underscore is an
// edge.
const W0 = String.raw`(?<![\p{L}\p{Nd}])`;
const W1 = String.raw`(?![\p{L}\p{Nd}])`;

const SSN_SHAPE = new RegExp(
  String.raw`(?<!\p{Nd}|\p{Nd}${DASH})${D}{3}-${D}{2}-${D}{4}(?!\p{Nd}|-\p{Nd})`,
  flags
);

// A labelled number: digits in groups joined as in a run.
const GROUPS = `${D}+(?:${JOIN}${D}+)*`;

const SSN_LABEL = new RegExp(
  String.raw`${W0}(?:SSN|social${BETWEEN}security(?:${BETWEEN}(?:number|no))?)${BETWEEN}(${GROUPS})${END}`,
  flags
);

const LABEL = String.raw`(?:account|acct|a/c|routing|aba|rtn|iban|card|visa|mastercard|amex|american express|discover)`;

// The start of another field after a labelled number: a date or a phone.
const DATE = String.raw`(?:${D}{4}${DASH}${D}{1,2}${DASH}${D}{1,2}|${D}{1,2}${DASH}${D}{1,2}${DASH}${D}{4})(?!\p{Nd})`;
const NEXT_FIELD = String.raw`(?:${DATE}|${D}{3}-${D}{3}-${D}{4}(?!\p{Nd}))`;

// A labelled number, not a date: groups of 2 to 6 digits (as banks print
// "021 000 021"), or digits joined only by dashes, stopping where a date or
// phone begins. A longer group after a space is the next field.
const GROUPED = `${D}{2,6}(?:${JOIN}(?!${NEXT_FIELD})${D}{2,6})+`;
const DASHED = `${D}+(?:(?:${DASH}|${GAP}*${DASH}${GAP}*(?!${NEXT_FIELD}))${D}+)*`;
const LABELLED = `(?<!\\*{4})(?!${DATE})(?:${GROUPED}|${DASHED})`;

const ACCOUNT_LABEL = new RegExp(
  String.raw`${W0}${LABEL}(?:${BETWEEN}[/&]${BETWEEN}(?:${LABEL}|ach|wire))*` +
    String.raw`(?:${BETWEEN}(?:number|num|no)${W1})?${BETWEEN}(${LABELLED})${END}`,
  flags
);

// An IBAN: country code, check digits, and 11 to 30 letters and digits,
// contiguous or in groups of four. Its digits are glued to letters, so the
// run rule alone would take it for a document identifier.
const IBAN = new RegExp(
  String.raw`(?<![\p{L}\p{Nd}])[A-Z]{2}${D}{2}(?:${H}?[A-Z0-9]{4}){2,7}(?:${H}?[A-Z0-9]{1,4})?(?![\p{L}\p{Nd}])`,
  "gu"
);

const PHONE_LABEL = new RegExp(
  String.raw`${W0}(?:phone|telephone|tel|fax|call|mobile|cell)${W1}${BETWEEN}(\+?${D}+(?:(?:${JOIN}|${H}*[()]${H}*)${D}+)*)${END}`,
  flags
);
const EIN_LABEL = new RegExp(
  String.raw`${W0}(?:F?EIN|employer${BETWEEN}identification(?:${BETWEEN}(?:number|no))?)${BETWEEN}(${GROUPS})${END}`,
  flags
);

const CLEAR_SHAPES = [
  // Phones.
  String.raw`(?<!\p{Nd})(?:1-)?${D}{3}-${D}{3}-${D}{4}(?!\p{Nd}|-\p{Nd})`,
  String.raw`(?<!\p{Nd})(?:1${H}?)?\(${D}{3}\)${H}*${D}{3}[\-.]${D}{4}(?!\p{Nd})`,
  String.raw`\+${H}?${D}{1,3}(?:(?:${H}|[\-.])?\(?${D}{1,4}\)?)+(?!\p{Nd})`,
  // The EIN, a ZIP+4.
  String.raw`(?<!\p{Nd}|\p{Nd}-)${D}{2}-${D}{7}(?!\p{Nd}|-\p{Nd})`,
  String.raw`(?<!\p{Nd}|\p{Nd}-)${D}{5}-${D}{4}(?!\p{Nd}|-\p{Nd})`,
  // Dates.
  String.raw`(?<!\p{Nd})${DATE}`,
  // A number Masking (or the Source) already masked.
  String.raw`\*{4,}${D}{4}(?!\p{Nd})|\*{3}-\*{2}-${D}{4}(?!\p{Nd})`,
  // Amounts led by a currency sign.
  String.raw`[$€£¥]${H}*${D}[\p{Nd},]*(?:\.${D}+)?`,
].map((shape) => new RegExp(shape, flags));

const RUN = new RegExp(`${START}${D}+(?:${JOIN}${D}+)*${END}`, flags);

const digitsOf = (value: string) => value.match(/\p{Nd}/gu) ?? [];
const count = (value: string) => digitsOf(value).length;
const lastFour = (value: string) => digitsOf(value).slice(-4).join("");

/** A date shape only when its month and day are plausible. */
function isDate(value: string): boolean {
  const groups = value.match(/\p{Nd}+/gu) ?? [];
  const [a, b, c] = groups.map((g) => Number(digitsOf(g).join("")));
  if (groups[0]?.length === 4) return b >= 1 && b <= 12 && c >= 1 && c <= 31;
  return a >= 1 && b >= 1 && a <= 31 && b <= 31 && (a <= 12 || b <= 12);
}

/** Every sensitive number in `text`, in text order, none overlapping. */
function find(text: string): Found[] {
  const spans: (Found | { start: number; end: number; clear: true })[] = [];
  const free = (start: number, end: number) =>
    !spans.some((s) => start < s.end && s.start < end);
  const take = (start: number, value: string, kind: MaskedValue["kind"]) => {
    const end = start + value.length;
    if (!free(start, end)) return;
    const masked =
      kind === "ssn" ? `***-**-${lastFour(value)}` : `****${lastFour(value)}`;
    spans.push({ value, masked, kind, start, end });
  };
  const keep = (start: number, value: string) => {
    const end = start + value.length;
    if (free(start, end)) spans.push({ start, end, clear: true });
  };
  // The captured number sits at the end of a labelled match.
  const tail = (m: RegExpMatchArray) =>
    (m.index ?? 0) + m[0].length - m[1].length;

  for (const m of text.matchAll(SSN_SHAPE)) take(m.index ?? 0, m[0], "ssn");
  for (const m of text.matchAll(SSN_LABEL))
    if (count(m[1]) === 9) take(tail(m), m[1], "ssn");
  for (const m of text.matchAll(IBAN))
    if (count(m[0]) >= 8) take(m.index ?? 0, m[0], "account");
  for (const m of text.matchAll(ACCOUNT_LABEL)) {
    const n = count(m[1]);
    if (n >= 6 && n <= 19) take(tail(m), m[1], "account");
  }

  for (const m of text.matchAll(PHONE_LABEL)) {
    const n = count(m[1]);
    if (n >= 10 && n <= (m[1].startsWith("+") ? 15 : 11)) keep(tail(m), m[1]);
  }
  for (const m of text.matchAll(EIN_LABEL))
    if (count(m[1]) === 9) keep(tail(m), m[1]);
  for (const shape of CLEAR_SHAPES)
    for (const m of text.matchAll(shape)) {
      if (m[0].startsWith("+") && count(m[0]) > 15) continue;
      if (shape === CLEAR_SHAPES[5] && !isDate(m[0])) continue;
      keep(m.index ?? 0, m[0]);
    }

  // Runs are found with every span already decided blanked out, so a run
  // never reaches into a masked number or a clear shape.
  let rest = text;
  for (const s of spans)
    rest =
      rest.slice(0, s.start) + "\0".repeat(s.end - s.start) + rest.slice(s.end);
  for (const m of rest.matchAll(RUN))
    if (count(m[0]) >= 8) take(m.index ?? 0, m[0], "account");

  return spans
    .filter((s): s is Found => !("clear" in s))
    .sort((a, b) => a.start - b.start);
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
