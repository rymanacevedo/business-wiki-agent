import { frame } from "./lib/frame";
import { mask, maskedValues as listMasked, type MaskedValue } from "./lib/mask";

export type { MaskedValue };

/**
 * Masking: SSNs become `***-**-NNNN`, financial account, card, and routing
 * numbers become `****NNNN`. Nothing else changes (names, addresses, phones,
 * emails, the EIN stay clear). The rules that find each class are documented
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
