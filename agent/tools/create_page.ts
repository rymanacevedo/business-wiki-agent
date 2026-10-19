import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { validatePage } from "../../packages/page-edits";
import { WikiConflictError } from "../../packages/wiki-store";
import { wiki } from "../lib/config";
import { pagePath } from "../lib/pages";
import { refuseDuplicateRecord } from "../lib/duplicates";
import { declinedPaths } from "../lib/sequence";

export default defineTool({
  description:
    "Create one new Wiki Page (summary, entity, Obligation, Ledger, or the Profile) with its full Markdown content, frontmatter included, following SCHEMA.md. Fails if the Page already exists: edit existing Pages with update_page, or change_fact for Established Facts.",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "Page path relative to the Wiki root, e.g. summaries/<source-id>.md"
      ),
    content: z
      .string()
      .min(1)
      .describe("The whole Page: frontmatter then body"),
  }),
  approval: never(),
  label: { start: ({ path }) => `Create ${path}` },
  async execute({ path, content }, ctx) {
    const clean = pagePath(path);
    validatePage(clean, content);
    if (declinedPaths(ctx.messages).includes(clean))
      throw new Error(
        `The Owner declined the change_fact that proposed ${clean}; it is not created. Do not retry the change.`
      );
    const store = wiki(ctx);
    await refuseDuplicateRecord(store, clean, null, content);
    try {
      await store.write(
        clean,
        content.endsWith("\n") ? content : `${content}\n`,
        {
          etag: null,
        }
      );
    } catch (error) {
      if (error instanceof WikiConflictError)
        throw new Error(
          `${clean} already exists. Read it with read_page and edit it with update_page (or change_fact for an Established Fact).`
        );
      throw error;
    }
    return `Created ${clean}.`;
  },
});
