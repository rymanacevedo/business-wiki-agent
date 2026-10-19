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

/** Top-level scalar keys of the frontmatter, `key -> trimmed value`. */
export function topLevelKeys(frontmatter: string[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const line of frontmatter) {
    const match = /^([a-z_]+)\s*:(.*)$/.exec(line);
    if (match) keys.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
  }
  return keys;
}
