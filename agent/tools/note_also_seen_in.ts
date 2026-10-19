import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import {
  expenseFields,
  guardPageEdit,
  validatePage,
} from "../../packages/page-edits";
import { SOURCES, wiki } from "../lib/config";
import { pagePath, touch } from "../lib/pages";

const SECTION = /^## Also seen in[ \t]*$/m;

/** The Record with `line` under its one `## Also seen in` section. */
export function withAlsoSeenIn(page: string, line: string): string {
  const at = SECTION.exec(page);
  if (!at) return `${page.replace(/\s+$/, "")}\n\n## Also seen in\n\n${line}\n`;
  const start = at.index + at[0].length;
  const next = page.slice(start).search(/^## /m);
  const end = next === -1 ? page.length : start + next;
  const lines = page
    .slice(start, end)
    .split("\n")
    .filter((l) => l.trim());
  const section = `\n\n${[...lines, line].join("\n")}\n`;
  return `${page.slice(0, start)}${section}${next === -1 ? "" : `\n${page.slice(end)}`}`;
}

export default defineTool({
  description:
    "List a Source under `## Also seen in` on one or more Expense Records, in one call and without reading them first: a duplicate copy on the Record it duplicates, a statement or stamped copy on every Record it corroborates or shows paid. Adds the section when a Record has none. Never changes a payment block: that is change_fact.",
  inputSchema: z.object({
    source: z.string().describe("The Source id being listed"),
    records: z
      .array(
        z.object({
          path: z.string().describe("The Record, e.g. summaries/<id>.md"),
          note: z
            .string()
            .min(1)
            .describe(
              'What it is to the Record: "duplicate", "corroborates payment", "payment evidence, pending Approval"'
            ),
        })
      )
      .min(1),
  }),
  approval: never(),
  label: {
    start: ({ source, records }) =>
      `List ${source} on ${records.length} Record${records.length === 1 ? "" : "s"}`,
  },
  async execute({ source, records }) {
    const store = wiki();
    if (
      !(await store.read(`${SOURCES}${source}.md`)) &&
      !(await store.read(`${SOURCES}${source}.txt`))
    )
      throw new Error(
        `No Source with id ${source}. Use list_sources for the ids.`
      );
    // Check every Record before writing any, so nothing is written by halves.
    const writes: { path: string; etag: string; next: string }[] = [];
    for (const { path, note } of records) {
      const clean = pagePath(path);
      const page = await store.read(clean);
      if (!page || !expenseFields(page.body))
        throw new Error(
          `${clean} is not an Expense Record (a summary with an expense block). Nothing was written.`
        );
      const line = `- ${source}: ${note.replace(/\s*\n\s*/g, " ").trim()} (src: ${source})`;
      const section = page.body.split(SECTION)[1]?.split(/^## /m)[0] ?? "";
      if (section.includes(`- ${source}:`)) continue;
      const next = touch(withAlsoSeenIn(page.body, line));
      guardPageEdit(clean, page.body, next);
      validatePage(clean, next);
      writes.push({ path: clean, etag: page.etag, next });
    }
    for (const { path, etag, next } of writes)
      await store.write(path, next, { etag });
    const count = writes.length;
    return `Listed ${source} on ${count} Record${count === 1 ? "" : "s"}${count < records.length ? ` (${records.length - count} already listed it)` : ""}.`;
  },
});
