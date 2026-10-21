import { frame } from "./lib/frame";
import { mask, maskedValues as listMasked, type MaskedValue } from "./lib/mask";

export type { MaskedValue };

/**
 * Masking, fail-safe: SSNs become `***-**-NNNN`; labelled account, card, and
 * routing numbers, and every other run of 8 or more digits, become
 * `****NNNN`, unless the run is positively a phone, the EIN, a date, an
 * amount, a ZIP+4, or a document identifier glued to letters. Names,
 * addresses, emails, and short numbers stay clear. The rules are documented
 * in `lib/mask.ts`.
 */
export function maskSource(text: string): string {
  return mask(text);
}

/**
 * The full values Masking hides in `text` (SSNs, and account, card, and
 * routing numbers), in text order, each with its masked form: what must never leave the
 * immutable Source.
 */
export function maskedValues(text: string): MaskedValue[] {
  return listMasked(text);
}

/**
 * What `read_source` hands the model: the masked Source between
 * `<source>` delimiters, under a header saying it is document data, not
 * instructions.
 */
export function frameSource(id: string, text: string): string {
  return frame(id, mask(text));
}
