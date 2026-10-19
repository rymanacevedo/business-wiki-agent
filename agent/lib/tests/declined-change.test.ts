import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore, type WikiStore } from "../../../packages/wiki-store";
import { seedNamespace } from "../../../packages/wiki-store/seed";
import appendLog from "../../tools/append_log";
import createPage from "../../tools/create_page";
import updatePage from "../../tools/update_page";

// The Owner's "no" to a change_fact is final for the rest of the turn: the
// INGEST gate stops asking for what the declined change covered, and neither
// create_page nor update_page lands it under another name or shape. The turn
// is faked from the base fixture plus the renewed certificate's summary.

const RENEWAL = "2026-10-14-insurance-cert-meridian-renewal";
const SUMMARY = `summaries/${RENEWAL}.md`;
const OLD = "obligations/2026-11-15-insurance-renewal-meridian-mutual.md";
const NEW = "obligations/2027-11-15-insurance-renewal-meridian-mutual.md";
const PROFILE_LINE =
  "- **Commercial general liability policy**: Meridian Mutual Insurance Company policy GL-2025-77410 effective 2025-11-15 to 2026-11-15; limits $1,000,000 each occurrence / $2,000,000 general aggregate; annual premium $1,284.00 (src: 2025-11-15-insurance-cert-meridian)";

const summary = `---
title: Meridian Mutual insurance certificate 2026-10-14
kind: summary
sources: [${RENEWAL}]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

- **Policy number**: GL-2026-80233 (src: ${RENEWAL})
- **Policy period**: effective 2026-11-15, expires 2027-11-15 (src: ${RENEWAL})
- Proposed change declined by the Owner on 2026-10-17: keep the current policy on file.
`;

const supersession = {
  changes: [
    {
      page: OLD,
      old_value: "status: active",
      new_value: `status: superseded\nsuperseded_by: ${NEW}`,
    },
    {
      page: OLD,
      old_value: "- **Status**: active",
      new_value: "- **Status**: superseded",
    },
    {
      page: "profile.md",
      old_value: PROFILE_LINE,
      new_value: `- **Commercial general liability policy**: Meridian Mutual Insurance Company policy GL-2026-80233 effective 2026-11-15 to 2027-11-15 (src: ${RENEWAL})`,
    },
  ],
  source: RENEWAL,
  reason: "The renewed certificate replaces policy GL-2025-77410.",
};

/** A turn in which Clerk proposed the Supersession and the Owner answered. */
function turn(output: unknown) {
  return [
    { role: "user", content: "Ingest the renewed insurance certificate." },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "change_fact",
          input: supersession,
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "change_fact",
          output,
        },
      ],
    },
  ];
}
const denied = turn({
  type: "execution-denied",
  reason: 'Tool execution was denied. The person who denied it wrote: "no"',
});
const failed = turn({ type: "error-text", value: "No Page at profile.md." });

type Tool = { execute: (input: unknown, ctx: unknown) => Promise<unknown> };
async function call(tool: unknown, input: unknown, messages: unknown[]) {
  try {
    return String(await (tool as Tool).execute(input, { messages }));
  } catch (error) {
    return `refused: ${(error as Error).message}`;
  }
}

let root = "";
let store: WikiStore;
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "declined-change-test-"));
  await seedNamespace({
    namespace: "t",
    fixtureDir: resolve(__dirname, "../../../fixtures/base"),
    sourcesDir: resolve(__dirname, "../../../corpus/sources"),
    env: { WIKI_STORE_DIR: root },
  });
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  store = createWikiStore({ namespace: "t" });
  await call(
    createPage,
    {
      path: SUMMARY,
      content: summary,
      index_line: `- 2026-10-14 insurance-certificate: [Meridian Mutual insurance certificate 2026-10-14](${SUMMARY}): renewal of GL-2025-77410`,
    },
    []
  );
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const ingest = (messages: unknown[]) =>
  call(
    appendLog,
    { type: "INGEST", subject: RENEWAL, detail: "summary created" },
    messages
  );

test("without a declined change, the INGEST gate asks for the new Obligation and the Profile", async () => {
  const result = await ingest(failed);
  assert.match(result, /^refused: /);
  assert.match(result, /expires 2027-11-15: create its Obligation/);
  assert.match(result, /profile\.md cites nothing from/);
});

test("after the Owner declines the Supersession, the INGEST line is logged without its Obligation or Profile line", async () => {
  assert.match(
    await ingest(denied),
    new RegExp(`^Logged: .* INGEST \\[${RENEWAL}\\]`)
  );
});

const RENAMED =
  "obligations/2027-11-15-insurance-renewal-meridian-mutual-gl-2026-80233.md";
const renewal = {
  path: RENAMED,
  content: `---
title: Insurance renewal for Meridian Mutual policy GL-2026-80233
kind: obligation
obligation: insurance-renewal
sources: [${RENEWAL}]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
due: 2027-11-15
counterparty: meridian-mutual-insurance-company
recurs: none
---

- **Policy**: Meridian Mutual policy GL-2026-80233, expires 2027-11-15 (src: ${RENEWAL})
- **Status**: active
`,
  index_line: `- 2027-11-15 insurance-renewal (active): [Insurance renewal for Meridian Mutual policy GL-2026-80233](${RENAMED}): Policy GL-2026-80233 expires 2027-11-15`,
};

test("create_page refuses the declined Obligation under another file name", async () => {
  const result = await call(createPage, renewal, denied);
  assert.match(result, /^refused: .*declined/);
  assert.equal(await store.read(RENAMED), null);
});

test("an Obligation from a change_fact that only failed is still created", async () => {
  assert.match(await call(createPage, renewal, failed), /^Created /);
});

const contradiction = {
  path: "profile.md",
  edits: [
    {
      find: PROFILE_LINE,
      replace: `- **Commercial general liability policy**: ⚠ **Conflict**, unresolved since 2026-10-17: Meridian Mutual Insurance Company policy GL-2025-77410 effective 2025-11-15 to 2026-11-15; limits $1,000,000 each occurrence / $2,000,000 general aggregate; annual premium $1,284.00 (src: 2025-11-15-insurance-cert-meridian) or policy GL-2026-80233 (src: ${RENEWAL})`,
    },
    { find: "flags: []", replace: "flags: [conflict]" },
  ],
};

test("update_page refuses to rewrite the declined Profile line, even into a Contradiction", async () => {
  const before = (await store.read("profile.md"))?.body;
  const result = await call(updatePage, contradiction, denied);
  assert.match(result, /^refused: .*declined/);
  assert.equal((await store.read("profile.md"))?.body, before);
});

test("the same Contradiction is recorded when no change to that line was declined", async () => {
  assert.match(await call(updatePage, contradiction, failed), /^Updated /);
});

test("other Profile lines stay editable after the denial", async () => {
  const result = await call(
    updatePage,
    {
      path: "profile.md",
      edits: [
        {
          find: PROFILE_LINE,
          replace: `${PROFILE_LINE}\n- **Insurance producer**: Bayline Insurance Agency, 42 Pier Rd, Portside (src: ${RENEWAL})`,
        },
      ],
    },
    denied
  );
  assert.match(result, /^Updated /);
});
