import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore, type WikiStore } from "../../../packages/wiki-store";
import noteAlsoSeenIn from "../../tools/note_also_seen_in";

// A statement or a duplicate is listed on the Records it touches under
// `## Also seen in`. One call lists it on every Record, without reading them
// first: a bank statement corroborating six receipts takes one step.

const tool = noteAlsoSeenIn as unknown as {
  execute: (input: unknown, ctx: unknown) => Promise<string>;
};

const STATEMENT = "2026-09-30-bank-statement-tidewater";
const A = "summaries/2026-09-02-receipt-portside-fuel.md";
const B = "summaries/2026-09-09-receipt-valley-electric.md";

const record = (id: string, tail = "") => `---
title: Receipt ${id}
kind: summary
sources: [${id}]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
expense:
  vendor: acme
  date: 2026-09-02
  amount: 10.00
  currency: USD
  document: null
  allocations:
    - { category: supplies, amount: 10.00 }
  payment:
    status: paid
    due: null
    evidence: [${id}]
---

# Receipt ${id}

- Total $10.00 (src: ${id})
${tail}`;

let root = "";
let store: WikiStore;
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "also-seen-in-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  mkdirSync(join(root, "t", "sources"), { recursive: true });
  writeFileSync(join(root, "t", "sources", `${STATEMENT}.md`), "STATEMENT\n");
  store = createWikiStore({ namespace: "t" });
  await store.write(A, record("2026-09-02-receipt-portside-fuel"), {
    etag: null,
  });
  await store.write(
    B,
    record(
      "2026-09-09-receipt-valley-electric",
      "\n## Also seen in\n\n- 2026-09-09-receipt-valley-electric-2: duplicate (src: 2026-09-09-receipt-valley-electric-2)\n\n## Notes\n\n- kept\n"
    ),
    { etag: null }
  );
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const body = async (path: string) => (await store.read(path))!.body;

test("lists the Source on every Record, adding the section or a line under the existing one", async () => {
  const result = await tool.execute(
    {
      source: STATEMENT,
      records: [
        { path: A, note: "corroborates payment" },
        { path: B, note: "corroborates payment" },
      ],
    },
    {}
  );
  assert.match(result, /2 Records/);
  const line = `- ${STATEMENT}: corroborates payment (src: ${STATEMENT})`;
  assert.ok((await body(A)).trimEnd().endsWith(`## Also seen in\n\n${line}`));
  const b = await body(B);
  assert.equal(b.match(/## Also seen in/g)?.length, 1);
  assert.match(
    b,
    new RegExp(
      `valley-electric-2\\)\\n${line.replace(/[()[\]]/g, "\\$&")}\\n\\n## Notes`
    )
  );
});

test("listing the same Source twice changes nothing", async () => {
  const input = {
    source: STATEMENT,
    records: [{ path: A, note: "corroborates payment" }],
  };
  await tool.execute(input, {});
  const once = await body(A);
  await tool.execute(input, {});
  assert.equal(await body(A), once);
});

test("refuses a Page that is not a Record and an unknown Source, writing nothing", async () => {
  await store.write("entities/acme.md", "# Acme\n", { etag: null });
  await assert.rejects(
    tool.execute(
      {
        source: STATEMENT,
        records: [
          { path: A, note: "corroborates payment" },
          { path: "entities/acme.md", note: "x" },
        ],
      },
      {}
    ),
    /entities\/acme\.md is not an Expense Record/
  );
  assert.doesNotMatch(await body(A), /Also seen in/);
  await assert.rejects(
    tool.execute(
      { source: "2026-01-01-nothing", records: [{ path: A, note: "x" }] },
      {}
    ),
    /No Source/
  );
});
