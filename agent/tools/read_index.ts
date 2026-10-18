import { defineTool } from "eve/tools";
import { z } from "zod";
import { clerkConfig, wiki } from "../lib/config";

export default defineTool({
  description:
    "Read the Wiki's Index (index.md): one line per Page, grouped by section. Call this first on every Ingest, Query, and Lint. Also returns today's Demo Date.",
  inputSchema: z.object({}),
  label: { start: () => "Read the Index" },
  async execute() {
    const index = await wiki().read("index.md");
    const today = `Demo Date (today): ${clerkConfig.demoDate}`;
    if (!index) return `${today}\n\nThe Wiki has no Index yet.`;
    return `${today}\n\n${index.body}`;
  },
});
