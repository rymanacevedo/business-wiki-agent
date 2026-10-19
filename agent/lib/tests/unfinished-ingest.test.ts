import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore, type WikiStore } from "../../../packages/wiki-store";
import { seedNamespace } from "../../../packages/wiki-store/seed";
import createPage from "../../tools/create_page";
import { unfinishedIngestNote } from "../unfinished-ingest";

type Tool = { execute: (input: unknown, ctx: unknown) => Promise<unknown> };

// When a turn has read a Source and its INGEST line is not written yet, each
// model step is told what the Ingest still lacks, so Clerk does not end the
// turn halfway (as after an Approval). Nothing is said otherwise. The turn is
// faked from the base fixture plus the renewed certificate's summary.

const RENEWAL = "2026-10-14-insurance-cert-meridian-renewal";
const SUMMARY = `summaries/${RENEWAL}.md`;
const OLD = "obligations/2026-11-15-insurance-renewal-meridian-mutual.md";
const NEW = "obligations/2027-11-15-insurance-renewal-meridian-mutual.md";

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
- **Business facts**: none new
`;

const supersession = {
  changes: [
    {
      page: OLD,
      old_value: "status: active",
      new_value: `status: superseded\nsuperseded_by: ${NEW}`,
    },
  ],
  source: RENEWAL,
  reason: "The renewed certificate replaces policy GL-2025-77410.",
};

let calls = 0;
/** One assistant step calling `toolName`, and its result. */
function step(toolName: string, input: unknown, output: unknown) {
  const toolCallId = `call-${++calls}`;
  return [
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId, toolName, input }],
    },
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId, toolName, output }],
    },
  ];
}
const owner = (content: string) => ({ role: "user", content });
const text = (value: string) => ({ type: "text", value });
const read = step("read_source", { id: RENEWAL }, text("<source>"));
const approved = step(
  "change_fact",
  supersession,
  text("Approved and applied: 1 change.")
);

let root = "";
let store: WikiStore;
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "unfinished-ingest-test-"));
  await seedNamespace({
    namespace: "t",
    fixtureDir: resolve(__dirname, "../../../fixtures/base"),
    sourcesDir: resolve(__dirname, "../../../corpus/sources"),
    env: { WIKI_STORE_DIR: root },
  });
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  store = createWikiStore({ namespace: "t" });
  await (createPage as unknown as Tool).execute(
    {
      path: SUMMARY,
      content: summary,
      index_line: `- 2026-10-14 insurance-certificate: [Meridian Mutual insurance certificate 2026-10-14](${SUMMARY}): renewal of GL-2025-77410`,
    },
    { messages: [] }
  );
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const note = (messages: unknown[]) => unfinishedIngestNote(messages, store);

test("after an approved Supersession, the step is told the new Obligation is still missing", async () => {
  const result = await note([
    owner(`Ingest ${RENEWAL}.`),
    ...read,
    ...approved,
  ]);
  assert.ok(result, "expected a note");
  assert.match(result, new RegExp(`Ingest of ${RENEWAL} is unfinished`));
  assert.match(result, /expires 2027-11-15: create its Obligation/);
  assert.match(result, /INGEST line before/);
});

const ingest = (output: unknown) =>
  step(
    "append_log",
    { type: "INGEST", subject: RENEWAL, detail: "summary created" },
    output
  );

test("once the turn has logged the Source's INGEST line, nothing is said", async () => {
  const logged = ingest(text(`Logged: - 2026-10-17 INGEST [${RENEWAL}]: x`));
  assert.equal(
    await note([owner(`Ingest ${RENEWAL}.`), ...read, ...approved, ...logged]),
    null
  );
});

test("eve's own user-role notes, such as the parked Approval's, do not start a new turn", async () => {
  const parked = {
    role: "user",
    kind: "context.state",
    content:
      "[Pending approvals]\nThe following tool calls are awaiting approval",
  };
  assert.ok(await note([owner(`Ingest ${RENEWAL}.`), ...read, parked]));
});

test("a Query or Lint turn, which reads no Source, is told nothing", async () => {
  const lookup = step("read_index", {}, text("# Index"));
  assert.equal(
    await note([owner("When does the insurance renew?"), ...lookup]),
    null
  );
});

test("a Source read in an earlier turn does not make this turn's note", async () => {
  assert.equal(
    await note([owner(`Ingest ${RENEWAL}.`), ...read, owner("Thanks.")]),
    null
  );
});

test("after a declined Supersession the gate asks nothing more, so nothing is said", async () => {
  const denied = step("change_fact", supersession, {
    type: "execution-denied",
    reason: "Tool execution was denied.",
  });
  assert.equal(
    await note([owner(`Ingest ${RENEWAL}.`), ...read, ...denied]),
    null
  );
});

test("the note lists at most three open items and counts the rest", async () => {
  for (const n of [1, 2, 3, 4])
    await store.write(
      `vendors/vendor-${n}.md`,
      `---\ntitle: Vendor ${n}\nkind: vendor\nsources: [${RENEWAL}]\nflags: []\n---\n\n# Vendor ${n}\n`,
      { etag: null }
    );
  const result = await note([owner(`Ingest ${RENEWAL}.`), ...read]);
  assert.ok(result);
  assert.equal(result.split("\n").filter((l) => l.startsWith("- ")).length, 3);
  assert.match(result, /and 2 more/);
});

test("a refused INGEST line does not finish the Ingest", async () => {
  const refused = ingest({
    type: "error-text",
    value: `Not logged: finish the Ingest of ${RENEWAL} first`,
  });
  assert.ok(
    await note([owner(`Ingest ${RENEWAL}.`), ...read, ...approved, ...refused])
  );
});
