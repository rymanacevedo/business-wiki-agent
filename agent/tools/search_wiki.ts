import { defineTool } from "eve/tools";
import { z } from "zod";
import { MATCH_KINDS, renderResult } from "../../packages/wiki-retrieval";
import { retrieval, retrievalNeighbourhood } from "../lib/config";

export default defineTool({
  description:
    "Ranked keyword search over the sections of every Wiki Page (not Sources, not the Index, Log or Schema). Returns up to five Pages, best first, each with the lines of its best section that match. Use only when the Index does not settle where a fact lives.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("The question or its keywords: names, amounts, dates, ids"),
    kind: z
      .enum(MATCH_KINDS)
      .optional()
      .describe("Only return Pages of this kind"),
  }),
  label: { start: ({ query }) => `Search the Wiki for "${query}"` },
  async execute({ query, kind }, ctx) {
    const result = await retrieval(ctx).search({
      query,
      kind,
      neighbourhood: retrievalNeighbourhood(),
    });
    const paths = (role: "match" | "neighbour") =>
      result.pages.filter((p) => p.role === role).map((p) => p.path);
    return {
      rung: result.rung,
      hopRan: result.hopRan,
      matches: paths("match"),
      neighbours: paths("neighbour"),
      text: renderResult(result),
    };
  },
  // Evals and traces read the structure; the model reads only the Markdown.
  toModelOutput: (output) => ({ type: "text", value: output.text }),
});
