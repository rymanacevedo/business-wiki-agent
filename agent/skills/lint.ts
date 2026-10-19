import { defineSkill } from "eve/skills";
import { clerkConfig } from "../lib/config";

const { demoDate } = clerkConfig;

// The Lint procedure. It is a skill, loaded only when the Owner asks for a
// Lint, so the always-on instructions every Ingest and Query step re-sends
// stay shorter (a session has a fixed input-token budget).
export default defineSkill({
  description:
    "The Lint procedure: use when the Owner asks to lint the wiki, for a health check, or for the Wiki's problems.",
  markdown: `# Lint

A Lint reads and reports; it changes nothing.

1. \`read_page(["SCHEMA.md"])\` and \`read_index\` (it gives the Demo Date),
   together in one step.
2. **Unresolved Contradictions**: \`search_wiki("Conflict unresolved")\`, then
   one \`read_page\` call with every Page found; every fact line in the Schema's Contradiction
   shape on a Page whose \`flags\` include \`conflict\` is one item: the fact, both
   values with their Citations.
3. **Suspicious Content**: \`search_wiki("suspicious-content flags")\`, then
   one \`read_page\` call with every Page found; every Page whose \`flags\` include
   \`suspicious-content\` is one item, quoting a few words of the flagged text.
4. **Obligations**: take every line in the Index's Obligations section that
   says \`(active)\`; \`done\` and \`superseded\` Obligations are never listed. For
   each, days until due = its due date minus the Demo Date ${demoDate}, counted
   in calendar days.
   - **Missed** (due before the Demo Date): say what the Wiki knows and no
     more. A payment Obligation: "due <due>: deadline passed; payment unconfirmed" (these exact words).
     An expiry (permit, license, policy): "expired <due>; no renewal in the
     wiki". Anything else: "deadline <due> passed; no record of completion in
     the wiki". Never write "missed payment": the Wiki cannot know a payment
     was not made.
   - **Due within 30 days** (0 to 30 days until due): "due <due> (<n> days)".
   - Anything due more than 30 days out is in neither section.
5. **Orphan Pages**: a Page you saw linked from another Page or returned by
   \`search_wiki\` that has no line in the Index. \`SCHEMA.md\`, \`index.md\`, and
   \`log.md\` are the Wiki's scaffolding, never on the Index and never orphans.
6. \`append_log\` one LINT line (no subject) with the count per section, e.g.
   "1 conflict; 1 suspicious-content; 2 missed; 2 due within 30 days; 0 orphans".
   That line is the only write: no \`create_page\`, \`update_page\`, or
   \`change_fact\`, even for a problem Lint finds.

Reply with exactly these five sections, in this order, as headings:
"Unresolved Contradictions", "Suspicious Content", "Missed Obligations",
"Due within 30 days", "Orphan Pages". Under each, one bullet per item, each
citing its Page as \`[title](/wiki/<path>)\` with the path copied exactly from
the Index or the Page you read; an empty section says "None.".
Nothing else after the sections but one line offering to help with any item.
`,
});
