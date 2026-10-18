import { paymentBlock, splitPage, topLevelKeys } from "./frontmatter";

/** A top-level frontmatter field's value, or null when the Page has none. */
export function pageField(page: string, key: string): string | null {
  return topLevelKeys(splitPage(page).frontmatter).get(key) ?? null;
}

/** A Record's `expense.payment.status`, or null when the Page has no payment block. */
export function paymentStatus(page: string): string | null {
  const block = paymentBlock(splitPage(page).frontmatter);
  if (!block) return null;
  return /status:\s*([a-z]+)/.exec(block.join(" "))?.[1] ?? null;
}
