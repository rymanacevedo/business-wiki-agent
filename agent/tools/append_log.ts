import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { SOURCES, wiki } from "../lib/config";
import { pageField } from "../../packages/page-edits";
import { ingestProblems } from "../lib/ingest-check";
import { appendLog, LOG, logLine } from "../lib/pages";

const SUBJECTS: Record<string, RegExp> = {
  FLAG: /^(conflict|suspicious-content|needs-owner)$/,
  MILESTONE: /^\d{4}-\d{2}-\d{2}$/,
};

export default defineTool({
  description:
    "Append one line to the Log (log.md), dated with the Demo Date: `- <date> TYPE [subject]: detail`. Subject is the Source id for INGEST, conflict/suspicious-content/needs-owner for FLAG (the detail names the flagged Page), the event's own date for MILESTONE; LINT has none. Exactly one INGEST line per Source. APPROVAL lines are written automatically, never with this tool.",
  inputSchema: z.object({
    type: z.enum(["INGEST", "LINT", "FLAG", "MILESTONE"]),
    subject: z.string().optional(),
    detail: z.string().min(1).describe("One line, no newlines"),
  }),
  approval: never(),
  label: {
    start: ({ type, subject }) => `Log ${type}${subject ? ` ${subject}` : ""}`,
  },
  async execute({ type, subject, detail }) {
    const store = wiki();
    const rule = SUBJECTS[type];
    if (rule && !rule.test(subject ?? ""))
      throw new Error(`${type} needs a subject matching ${rule}.`);
    if (type === "FLAG") {
      // A FLAG line records a flag set on a Page, so it must name that Page.
      const path = /\b(profile\.md|[a-z]+\/[a-z0-9-]+\.md)\b/.exec(detail)?.[1];
      const page = path ? await store.read(path) : null;
      if (!path || !page || !pageField(page.body, "flags")?.includes(subject!))
        throw new Error(
          `A FLAG line needs the path of the Page whose flags include ${subject} in its detail (set the flag on the Page first). Raise flags only for the Schema's cases.`
        );
    }
    if (type === "INGEST") {
      const id = subject ?? "";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id))
        throw new Error("INGEST needs the Source id as its subject.");
      const source =
        (await store.read(`${SOURCES}${id}.md`)) ??
        (await store.read(`${SOURCES}${id}.txt`));
      if (!source)
        throw new Error("INGEST needs the Source id as its subject.");
      // The latest INGEST line already names this Source: a second line for
      // the same Ingest. (An older line, from an earlier Ingest, is fine.)
      const log = await store.read(LOG);
      const ingests = log?.body.match(/ INGEST \[[^\]]*\]:/g) ?? [];
      if (ingests.at(-1) === ` INGEST [${id}]:`)
        throw new Error(
          `${id} already has its INGEST line; each Source gets exactly one.`
        );
      const problems = await ingestProblems(store, id);
      if (problems.length)
        throw new Error(
          `Not logged: finish the Ingest of ${id} first, then append the INGEST line again.\n- ${problems.join("\n- ")}`
        );
    }
    const line = logLine(type, subject, detail);
    await appendLog(store, line);
    return `Logged: ${line}`;
  },
});
