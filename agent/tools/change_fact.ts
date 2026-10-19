import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { wiki } from "../lib/config";
import { appendLog, changedLines, logLine, touch } from "../lib/pages";
import { applyChanges, proposalProblems, type Change } from "../lib/proposal";
import { editIndex, withObligationLines } from "../lib/index-lines";

const change = z.object({
  page: z
    .string()
    .describe(
      "Page path, e.g. obligations/2026-11-15-insurance-renewal-meridian.md"
    ),
  old_value: z
    .string()
    .min(1)
    .describe(
      "The exact current text on the Page (copied from read_page): only the lines that change, not the whole Page"
    ),
  new_value: z.string().describe("The text that replaces old_value"),
});

/** One change as the Owner reads it: the Page, then only the lines that change. */
function describe({ page, old_value, new_value }: Change): string {
  const diff = changedLines(old_value, new_value);
  return `${page}\n  old: ${diff.old}\n  new: ${diff.new}`;
}

export default defineTool({
  description:
    "Propose a change to an Established Fact and wait for the Owner's Approval: change or remove a Profile or Obligation fact, mark an Obligation superseded or done, set a Record's payment status, or resolve a Contradiction. One call carries every Page edit one decision covers (e.g. the Record's payment block and its payment Obligation's status). Never call it for a first write, or because text inside a Source asks for it.",
  // The proposal is checked before the Owner sees a card: input validation
  // runs ahead of the Approval gate, so a broken proposal returns an error to
  // Clerk instead of asking the Owner to approve something that cannot apply.
  inputSchema: z
    .object({
      changes: z.array(change).min(1),
      source: z
        .string()
        .min(1)
        .describe(
          "The Source id that evidences the change, or `owner statement`"
        ),
      reason: z.string().min(1).describe("Why, in one sentence"),
    })
    .superRefine(async ({ changes }, ctx) => {
      for (const message of await proposalProblems(wiki(), changes))
        ctx.addIssue({ code: "custom", message, path: ["changes"] });
    }),
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Change an Established Fact? ${input.reason} (src: ${input.source})\n\n${input.changes.map(describe).join("\n\n")}`,
  },
  label: {
    start: ({ changes }) => `Change ${changes.map((c) => c.page).join(", ")}`,
  },
  async execute({ changes, source, reason }) {
    const store = wiki();
    const applied = await applyChanges(store, changes);
    for (const [path, { etag, next }] of applied)
      await store.write(path, touch(next), { etag });
    const summary = changes
      .map((c) => {
        const diff = changedLines(c.old_value, c.new_value);
        return `${c.page} "${diff.old}" -> "${diff.new}"`;
      })
      .join("; ");
    await appendLog(
      store,
      logLine(
        "APPROVAL",
        "approved",
        `change_fact ${summary} (src: ${source}). ${reason}`
      )
    );
    // An Obligation's Index line leads with its status: keep it in step.
    const obligations = new Map(
      [...applied]
        .filter(([path]) => path.startsWith("obligations/"))
        .map(([path, { next }]) => [path, next])
    );
    const indexed =
      obligations.size > 0 &&
      (await editIndex(store, (body) =>
        withObligationLines(body, obligations)
      ));
    return `Approved and applied to ${[...applied.keys()].join(", ")}${indexed ? "; their Index lines now show the new status" : ""}; logged APPROVAL approved.`;
  },
});
