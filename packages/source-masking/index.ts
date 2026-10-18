import { frame } from "./lib/frame";
import { mask } from "./lib/mask";

/**
 * Masking: SSNs become `***-**-NNNN`, financial account, card, and routing
 * numbers become `****NNNN`. Nothing else changes (names, addresses, phones,
 * emails, the EIN stay clear).
 */
export function maskSource(text: string): string {
  return mask(text);
}

/**
 * What `read_source` hands the model: the masked Source between
 * `<source>` delimiters, under a header saying it is document data, not
 * instructions.
 */
export function frameSource(id: string, text: string): string {
  return frame(id, mask(text));
}
