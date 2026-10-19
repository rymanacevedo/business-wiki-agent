import { defineTool } from "eve/tools";
import { z } from "zod";
import { SOURCES, wiki } from "../lib/config";

export default defineTool({
  description:
    "Read one Wiki Page by its path relative to the Wiki root, e.g. profile.md, SCHEMA.md, obligations/2026-11-15-insurance-renewal-meridian.md. Open only Pages the Index points to. Sources are read with read_source, not here.",
  inputSchema: z.object({
    path: z.string().describe("Page path relative to the Wiki root, with .md"),
  }),
  label: { start: ({ path }) => `Read ${path}` },
  async execute({ path }, ctx) {
    const clean = path.replace(/^\/?(wiki\/)?/, "");
    if (clean.startsWith(SOURCES))
      throw new Error(
        "Sources are not Pages; use read_source with the Source id."
      );
    const page = await wiki(ctx).read(clean);
    if (!page)
      throw new Error(`No Page at ${clean}. Check the Index for the path.`);
    return page.body;
  },
});
