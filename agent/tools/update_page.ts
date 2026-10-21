import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import {
  applyEdits,
  guardPageEdit,
  validatePage,
} from "../../packages/page-edits";
import { wiki } from "../lib/config";
import { declinedLines, declinedThisTurn } from "../lib/declined";
import { refuseDuplicateRecord } from "../lib/duplicates";
import { INDEX, LOG, SCHEMA, pagePath, tidyIndex, touch } from "../lib/pages";

export default defineTool({
  description:
    "Edit an existing Wiki Page with find-and-replace edits: add a Ledger row, edit an Index line, add a new fact or a History line (list a Source under `## Also seen in` with note_also_seen_in; create_page adds a new Page's Index line). Each find must be exact text from the Page (read_page first) and match once; an empty find appends to the end. It cannot alter an Established Fact (a Profile or Obligation fact line or frontmatter field, or a Record's expense.payment block): use change_fact for those. Append to the Log with append_log.",
  inputSchema: z.object({
    path: z.string().describe("Page path relative to the Wiki root, with .md"),
    edits: z
      .array(
        z.object({
          find: z.string().describe("Exact current text; empty string appends"),
          replace: z.string().describe("Replacement text"),
        })
      )
      .min(1),
  }),
  approval: never(),
  label: { start: ({ path }) => `Update ${path}` },
  async execute({ path, edits }, ctx) {
    const clean = pagePath(path);
    if (clean === LOG)
      throw new Error("The Log is append-only: use append_log.");
    if (clean === SCHEMA)
      throw new Error("SCHEMA.md is maintained by the Owner, not by Ingest.");
    const store = wiki(ctx);
    const page = await store.read(clean);
    if (!page)
      throw new Error(`No Page at ${clean}. Create it with create_page.`);
    const edited = touch(applyEdits(page.body, edits));
    const next = clean === INDEX ? tidyIndex(edited) : edited;
    guardPageEdit(clean, page.body, next);
    // A line the Owner declined to change this turn stays exactly as it is,
    // in any shape: a Contradiction would land the declined value anyway.
    const kept = new Set(next.split("\n").map((l) => l.trim()));
    const current = new Set(page.body.split("\n").map((l) => l.trim()));
    for (const line of declinedLines(
      await declinedThisTurn(store, ctx.messages),
      clean
    ))
      if (current.has(line) && !kept.has(line))
        throw new Error(
          `The Owner declined the change_fact to this line of ${clean} this turn; it stays as it is: ${line}`
        );
    validatePage(clean, next);
    await refuseDuplicateRecord(store, clean, page.body, next);
    await store.write(clean, next, { etag: page.etag });
    return `Updated ${clean}.`;
  },
});
