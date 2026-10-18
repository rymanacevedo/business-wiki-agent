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

/** The Source ids in a Page's `sources` frontmatter, flow or block YAML. */
export function pageSources(page: string): string[] {
  const { frontmatter } = splitPage(page);
  const start = frontmatter.findIndex((line) => /^sources\s*:/.test(line));
  if (start === -1) return [];
  let text = frontmatter[start].replace(/^sources\s*:/, "");
  for (let i = start + 1; i < frontmatter.length; i++) {
    const line = frontmatter[i];
    if (line.trim() && !/^\s/.test(line)) break;
    text += ` ${line}`;
  }
  return text
    .replace(/[[\]]/g, " ")
    .split(/[\s,]+/)
    .map((id) => id.replace(/^-\s*/, "").replace(/^["']|["']$/g, ""))
    .filter((id) => id && id !== "-");
}
