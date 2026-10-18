import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { SOURCES, wiki } from "../lib/config";
import { appendLog, LOG, logLine } from "../lib/pages";

const SUBJECTS: Record<string, RegExp> = {
  FLAG: /^(conflict|suspicious-content|needs-owner)$/,
  MILESTONE: /^\d{4}-\d{2}-\d{2}$/,
};

export default defineTool({
  description:
    "Append one line to the Log (log.md), dated with the Demo Date: `- <date> TYPE [subject]: detail`. Subject is the Source id for INGEST, conflict/suspicious-content/needs-owner for FLAG, the event's own date for MILESTONE; LINT has none. Exactly one INGEST line per Source. APPROVAL lines are written automatically, never with this tool.",
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
    }
    const line = logLine(type, subject, detail);
    await appendLog(store, line);
    return `Logged: ${line}`;
  },
});
