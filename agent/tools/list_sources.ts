import { defineTool } from "eve/tools";
import { z } from "zod";
import { SOURCES, SUMMARIES, sourceId, wiki } from "../lib/config";

export default defineTool({
  description:
    "List every Source id with its status: Ingested (it has a summary Page) or Inbox (given to Clerk but not yet Ingested).",
  inputSchema: z.object({}),
  label: { start: () => "List Sources" },
  async execute(_input, ctx) {
    const store = wiki(ctx);
    const summaries = new Set(
      (await store.list(SUMMARIES)).map((path) =>
        path.slice(SUMMARIES.length).replace(/\.md$/, "")
      )
    );
    const ids = (await store.list(SOURCES)).map(sourceId);
    const inbox = ids.filter((id) => !summaries.has(id));
    const ingested = ids.filter((id) => summaries.has(id));
    return { inbox, ingested };
  },
  toModelOutput({ inbox, ingested }) {
    const list = (ids: string[]) =>
      ids.length ? ids.map((id) => `- ${id}`).join("\n") : "(none)";
    return {
      type: "text",
      value: `Inbox (${inbox.length}):\n${list(inbox)}\n\nIngested (${ingested.length}):\n${list(ingested)}`,
    };
  },
});
