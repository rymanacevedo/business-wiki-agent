import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { validatePage } from "../../packages/page-edits";
import { WikiConflictError } from "../../packages/wiki-store";
import { wiki } from "../lib/config";
import { pagePath } from "../lib/pages";

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
  async execute({ path, content }) {
    const clean = pagePath(path);
    validatePage(clean, content);
    try {
      await wiki().write(
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
