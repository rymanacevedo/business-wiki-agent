import assert from "node:assert/strict";
import type { Manifest, ManifestEntry } from "../../corpus";

/** A Page: frontmatter fields (arrays in flow style, or raw YAML strings) above a body. */
export function page(
  fields: Record<string, string | string[] | number>,
  body = ""
): string {
  const yaml = Object.entries(fields).map(([key, value]) =>
    Array.isArray(value)
      ? `${key}: [${value.join(", ")}]`
      : `${key}: ${String(value)}`
  );
  return `---\n${yaml.join("\n")}\n---\n\n${body}\n`;
}

/** An Expense Record for Source `id` (a summary with an `expense` block). */
export function record(
  id: string,
  { amount = 16.19, status = "paid", flags = [] as string[], body = "" } = {}
): string {
  return [
    "---",
    "kind: summary",
    `sources: [${id}]`,
    `flags: [${flags.join(", ")}]`,
    "expense:",
    `  amount: ${amount}`,
    "  payment:",
    `    status: ${status}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

export const wikiOf = (pages: Record<string, string>) =>
  new Map(Object.entries(pages));

export function entryOf(manifest: Manifest, id: string): ManifestEntry {
  const entry = manifest.sources.find((s) => s.id === id);
  assert.ok(entry, `no Manifest entry ${id}`);
  return entry;
}

/** A Log Page holding `lines` (each without the leading "- "). */
export const log = (...lines: string[]) =>
  page(
    { kind: "log" },
    `# Log\n\n${lines.map((line) => `- ${line}`).join("\n")}`
  );
