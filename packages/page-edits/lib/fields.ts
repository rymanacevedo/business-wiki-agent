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

/**
 * A Record's scalar `expense` fields (vendor, date, amount, currency,
 * document), unquoted, or null when the Page has no expense block.
 */
export function expenseFields(page: string): Record<string, string> | null {
  const { frontmatter } = splitPage(page);
  const start = frontmatter.findIndex((line) => /^expense\s*:/.test(line));
  if (start === -1) return null;
  const fields: Record<string, string> = {};
  let child = -1;
  for (const line of frontmatter.slice(start + 1)) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;
    if (child === -1) child = indent;
    const match = /^([a-z_]+):\s*(\S.*)$/.exec(line.trim());
    if (indent === child && match)
      fields[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}
