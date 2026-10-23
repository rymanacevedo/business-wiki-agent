// Variant A (prototype #47): what the model reads. No scores, no Rung.

import type { RetrievalResult } from "./result";

export const NO_MATCHES = "No Page matches the query.";
export const DEGRADED =
  "Keyword matches only this time: semantic matching was unavailable.";

/**
 * The result as Markdown in two tiers: `## Matches (n)`, each a `### <path>`
 * heading, a `<title> · <kind> · <status>` line (plus the section for a
 * later section) and its excerpt as blockquotes; then `## Also linked (n)`,
 * present only when the Neighbourhood has Pages. A degraded call adds one
 * trailing line.
 */
export function renderResult(result: RetrievalResult): string {
  const matches = result.pages.filter((p) => p.role === "match");
  const neighbours = result.pages.filter((p) => p.role === "neighbour");
  const out: string[] = [];
  if (matches.length === 0) out.push(NO_MATCHES);
  else {
    out.push(`## Matches (${matches.length})`);
    for (const p of matches) {
      out.push(`### ${p.path}`);
      const section =
        p.heading === undefined ? "" : ` · section "${p.heading}"`;
      out.push(`${p.title} · ${p.kind} · ${p.status}${section}`);
      for (const line of p.excerpt ?? []) out.push(`> ${line}`);
    }
    if (neighbours.length > 0) {
      out.push(`## Also linked (${neighbours.length})`);
      for (const p of neighbours) {
        const via = (p.via ?? [])
          .map((v) => `${v.labels.join(", ")} ${v.match}`)
          .join("; ");
        out.push(`- ${p.path} · ${p.kind} · ${p.status}: ${via}`);
      }
    }
  }
  if (result.degraded) out.push(DEGRADED);
  return out.join("\n");
}
