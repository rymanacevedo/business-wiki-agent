import { defineTool } from "eve/tools";
import { z } from "zod";
import { sourceStatus, wiki } from "../lib/config";

export default defineTool({
  description:
    "List every Source id with its status: Ingested (it has a summary Page) or Inbox (given to Clerk but not yet Ingested).",
  inputSchema: z.object({}),
  label: { start: () => "List Sources" },
  async execute(_input, ctx) {
    return sourceStatus(wiki(ctx));
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
