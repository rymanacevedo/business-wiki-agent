import { isDeepStrictEqual } from "node:util";
import { isAlias, isMap, parseDocument, type Document } from "yaml";

/** Split a Page into its frontmatter lines and its body (after the closing `---`). */
export function splitPage(page: string): {
  frontmatter: string[];
  body: string[];
} {
  const lines = page.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter: [], body: lines };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { frontmatter: lines.slice(1), body: [] };
  return { frontmatter: lines.slice(1, end), body: lines.slice(end + 1) };
}

const indent = (line: string) => line.length - line.trimStart().length;

/**
 * The `payment` block nested under `expense`, as trimmed non-empty lines, or
 * null when the Page has none. Handles block and flow YAML styles.
 */
export function paymentBlock(frontmatter: string[]): string[] | null {
  const expense = frontmatter.findIndex((line) => /^expense\s*:/.test(line));
  if (expense === -1) return null;
  for (let i = expense + 1; i < frontmatter.length; i++) {
    const line = frontmatter[i];
    if (line.trim() && indent(line) === 0) break;
    if (!/^\s+payment\s*:/.test(line)) continue;
    const block = [line.trim()];
    for (let j = i + 1; j < frontmatter.length; j++) {
      const next = frontmatter[j];
      if (!next.trim()) continue;
      if (indent(next) <= indent(line)) break;
      block.push(next.trim());
    }
    return block;
  }
  return null;
}

/** The frontmatter as a YAML document, or null when it is not valid YAML. */
export function parseFrontmatter(frontmatter: string[]): Document | null {
  const doc = parseDocument(frontmatter.join("\n"));
  return doc.errors.length ? null : doc;
}

/**
 * The resolved `expense.payment` value however the YAML spells it (block,
 * flow, quoted keys, anchors and aliases): `undefined` when the Page has
 * none, `"unreadable"` when the frontmatter is not valid YAML.
 */
function parsedPayment(frontmatter: string[]): unknown {
  const doc = parseFrontmatter(frontmatter);
  if (!doc) return "unreadable";
  let data: unknown;
  try {
    data = doc.toJS();
  } catch {
    return "unreadable";
  }
  if (!data || typeof data !== "object") return undefined;
  const expense = (data as Record<string, unknown>).expense;
  if (!expense || typeof expense !== "object") return undefined;
  return (expense as Record<string, unknown>).payment;
}

/**
 * Whether `before` and `after` frontmatter hold the same `expense.payment`,
 * compared as parsed YAML. False when `before` has one and either side
 * cannot be read: an unverifiable edit is treated as a change.
 */
export function samePayment(before: string[], after: string[]): boolean {
  const old = parsedPayment(before);
  if (old === undefined) return true;
  const next = parsedPayment(after);
  if (old === "unreadable" || next === "unreadable")
    return (
      !/payment/.test(before.join("\n")) ||
      before.join("\n") === after.join("\n")
    );
  return isDeepStrictEqual(old, next);
}

/**
 * Why the `expense` mapping or its `payment` is not in the Schema's block
 * form (flow `{ ... }` or an alias), or undefined when it is or is absent.
 */
export function expenseStyleProblem(doc: Document): string | undefined {
  const expense = doc.get("expense", true);
  if (expense === undefined) return undefined;
  if (isAlias(expense) || !isMap(expense) || expense.flow)
    return "expense must be a block mapping (one field per indented line), not inline { ... } or an alias";
  const payment = expense.get("payment", true);
  if (
    payment !== undefined &&
    (isAlias(payment) || !isMap(payment) || payment.flow)
  )
    return "expense.payment must be a block mapping (status, due, evidence on indented lines), not inline { ... } or an alias";
  return undefined;
}

/** Top-level scalar keys of the frontmatter, `key -> trimmed value`. */
export function topLevelKeys(frontmatter: string[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const line of frontmatter) {
    const match = /^([a-z_]+)\s*:(.*)$/.exec(line);
    if (match) keys.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
  }
  return keys;
}
