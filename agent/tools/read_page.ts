import { defineTool } from "eve/tools";
import { z } from "zod";
import { SOURCES, wiki } from "../lib/config";

const MAX_PAGES = 12;

export default defineTool({
  description:
    "Read Wiki Pages by their paths relative to the Wiki root, e.g. profile.md, SCHEMA.md, obligations/2026-11-15-insurance-renewal-meridian.md. Give every Page you need next in one call: each call re-sends the whole conversation. Open only Pages the Index points to. Sources are read with read_source, not here.",
  inputSchema: z.object({
    paths: z
      .array(z.string())
      .min(1)
      .max(MAX_PAGES)
      .describe("Page paths relative to the Wiki root, with .md"),
  }),
  label: { start: ({ paths }) => `Read ${paths.join(", ")}` },
  async execute({ paths }) {
    const store = wiki();
    const clean = paths.map((path) => path.replace(/^\/?(wiki\/)?/, ""));
    if (clean.some((path) => path.startsWith(SOURCES)))
      throw new Error(
        "Sources are not Pages; use read_source with the Source id."
      );
    const pages = await Promise.all(
      clean.map(async (path) => ({ path, page: await store.read(path) }))
    );
    const missing = (path: string) =>
      `No Page at ${path}. Check the Index for the path.`;
    if (pages.length === 1) {
      const [{ path, page }] = pages;
      if (!page) throw new Error(missing(path));
      return page.body;
    }
    return pages
      .map(
        ({ path, page }) => `=== ${path} ===\n${page?.body ?? missing(path)}`
      )
      .join("\n");
  },
});
