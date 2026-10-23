// A Page's frontmatter read as YAML, with page-edits' parser: the facts that
// fold into section 0, the scalars the Result carries, and the `flags` list.

import { isAlias, isMap, isScalar, isSeq, type Document } from "yaml";
import { parseFrontmatter } from "../../page-edits";

export type Frontmatter = {
  /** A top-level scalar's text, or undefined when absent, empty or not a scalar. */
  value(key: string): string | undefined;
  /** The top-level `flags`: a list's items, or a lone scalar as one flag. */
  flags: string[];
  /** Section 0's `key: value` lines, in document order. */
  facts: string[];
};

const SKIPPED_KEYS = new Set(["created", "updated"]);
const NONE: Frontmatter = { value: () => undefined, flags: [], facts: [] };

/**
 * Read `frontmatter` lines as YAML. A malformed frontmatter reads as empty:
 * no facts, no flags, no title (validatePage refuses such a write, so only
 * a hand edit can leave one).
 */
export function readFrontmatter(frontmatter: string[]): Frontmatter {
  const doc = parseFrontmatter(frontmatter);
  if (!doc || !isMap(doc.contents)) return NONE;
  const source = frontmatter.join("\n");
  const resolve = (node: unknown) =>
    isAlias(node) ? node.resolve(doc as Document) : node;
  // A scalar's text as written (so `20.00` stays `20.00`), unquoted, on one line.
  const text = (raw: unknown): string | undefined => {
    const node = resolve(raw);
    if (!isScalar(node) || node.value === null) return undefined;
    const written =
      node.type === "PLAIN" && node.range
        ? source.slice(node.range[0], node.range[1])
        : String(node.value);
    return written.replace(/\s+/g, " ").trim() || undefined;
  };
  const items = (raw: unknown): string[] | undefined => {
    const node = resolve(raw);
    if (!isSeq(node)) return undefined;
    return node.items.flatMap((item) => text(item) ?? []);
  };

  const top = new Map<string, unknown>();
  for (const pair of doc.contents.items)
    if (isScalar(pair.key)) top.set(String(pair.key.value), pair.value);

  const facts: string[] = [];
  // Keys under `payment` read `payment.<key>`; lists read `key: [a, b]`;
  // maps inside lists (the allocation rows) and empty values are skipped.
  const fold = (map: unknown, parent: string | undefined) => {
    const node = resolve(map);
    if (!isMap(node)) return;
    for (const pair of node.items) {
      if (!isScalar(pair.key)) continue;
      const key = String(pair.key.value);
      if (parent === undefined && SKIPPED_KEYS.has(key)) continue;
      const name = parent === "payment" ? `payment.${key}` : key;
      const value = resolve(pair.value);
      if (isMap(value)) fold(value, key);
      else if (isSeq(value)) {
        const list = items(value) ?? [];
        if (list.length) facts.push(`${name}: [${list.join(", ")}]`);
      } else {
        const scalar = text(value);
        if (scalar !== undefined) facts.push(`${name}: ${scalar}`);
      }
    }
  };
  fold(doc.contents, undefined);

  const flags = top.get("flags");
  return {
    value: (key) => text(top.get(key)),
    flags: items(flags) ?? (text(flags) ? [text(flags)!] : []),
    facts,
  };
}
