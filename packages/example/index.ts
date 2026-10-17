import { normalizeWords } from "./lib/impl";

/** Normalize whitespace and capitalize words for a display title. */
export function formatTitle(input: string): string {
  return normalizeWords(input)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
