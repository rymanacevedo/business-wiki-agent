import { defineTool } from "eve/tools";
import { z } from "zod";
import { FLAGS } from "../../packages/wiki-retrieval";
import { retrieval } from "../lib/config";

export default defineTool({
  description:
    "List every Wiki Page whose frontmatter flags include the given flag, one line per Page (path · kind · status), sorted by path. Exhaustive, not ranked: use it for a Lint's flag scans, then read_page the Pages listed.",
  inputSchema: z.object({
    flag: z.enum(FLAGS).describe("The Schema's flag to scan for"),
  }),
  label: { start: ({ flag }) => `List Pages flagged ${flag}` },
  async execute({ flag }, ctx) {
    const pages = await retrieval(ctx).flagged(flag);
    if (pages.length === 0) return `No Page carries the flag ${flag}.`;
    return pages
      .map(({ path, kind, status }) => `${path} · ${kind} · ${status}`)
      .join("\n");
  },
});
