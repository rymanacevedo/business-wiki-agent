import { defineTool } from "eve/tools";
import { z } from "zod";
import { SOURCES, wiki } from "../lib/config";

const MAX_PAGES = 8;
const MAX_LINES = 5;

export default defineTool({
  description:
    "Keyword search over the text of every Wiki Page (not Sources). Returns the best-matching Pages with their matching lines. Use only when the Index does not settle where a fact lives.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Keywords; Pages matching more of them rank higher"),
  }),
  label: { start: ({ query }) => `Search the Wiki for "${query}"` },
  async execute({ query }, ctx) {
    const terms = [
      ...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u)),
    ].filter((term) => term.length > 1);
    if (terms.length === 0) throw new Error("Give at least one keyword.");
    const store = wiki(ctx);
    const paths = (await store.list("")).filter(
      (path) => !path.startsWith(SOURCES)
    );
    const hits: { path: string; score: number; lines: string[] }[] = [];
    for (const path of paths) {
      const page = await store.read(path);
      if (!page) continue;
      const text = page.body.toLowerCase();
      const matched = terms.filter((term) => text.includes(term));
      if (matched.length === 0) continue;
      const occurrences = matched.reduce(
        (sum, term) => sum + text.split(term).length - 1,
        0
      );
      const lines = page.body
        .split("\n")
        .filter((line) =>
          matched.some((term) => line.toLowerCase().includes(term))
        )
        .slice(0, MAX_LINES)
        .map((line) => line.trim());
      hits.push({ path, score: matched.length * 1000 + occurrences, lines });
    }
    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    if (hits.length === 0) return `No Page mentions ${terms.join(", ")}.`;
    return hits
      .slice(0, MAX_PAGES)
      .map(
        ({ path, lines }) => `${path}\n${lines.map((l) => `  ${l}`).join("\n")}`
      )
      .join("\n\n");
  },
});
