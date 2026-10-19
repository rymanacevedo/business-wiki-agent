import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore, type WikiStore } from "../../../packages/wiki-store";
import createPage from "../../tools/create_page";
import updatePage from "../../tools/update_page";

// A duplicate adds no Record: the write tools refuse a second Record with the
// same vendor, date, amount, and document number as an existing one.

const RECORD = "summaries/2026-09-12-invoice-cascade-parts-4471.md";
const COPY = "summaries/2026-09-12-invoice-cascade-parts-4471-2.md";

const expense = `expense:
  vendor: cascade-appliance-parts
  date: 2026-09-12
  amount: 212.48
  currency: USD
  document: "4471"
  allocations:
    - { category: supplies, amount: 212.48 }
  payment:
    status: unknown
    due: 2026-10-12
    evidence: []
`;
const summary = (source: string, block = "") => `---
title: Cascade Appliance Parts invoice 4471
kind: summary
sources: [${source}]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
${block}---

# Cascade Appliance Parts invoice 4471
`;

type Tool = { execute: (input: unknown, ctx: unknown) => Promise<string> };
async function run(tool: unknown, input: unknown): Promise<string> {
  try {
    return await (tool as Tool).execute(input, { messages: [] });
  } catch (error) {
    return `refused: ${(error as Error).message}`;
  }
}

let root = "";
let store: WikiStore;
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "duplicate-record-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  store = createWikiStore({ namespace: "t" });
  await store.write(
    RECORD,
    summary("2026-09-12-invoice-cascade-parts-4471", expense),
    {
      etag: null,
    }
  );
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

test("create_page refuses a second Record for the same invoice", async () => {
  const result = await run(createPage, {
    path: COPY,
    content: summary("2026-09-12-invoice-cascade-parts-4471-2", expense),
    index_line: `- 2026-09-12 invoice: [Invoice 4471 copy](${COPY}): PAID copy.`,
  });
  assert.match(result, /^refused: /);
  assert.match(result, new RegExp(RECORD));
  assert.equal(await store.read(COPY), null);
});

test("update_page refuses to give a duplicate's summary its own Record", async () => {
  await store.write(COPY, summary("2026-09-12-invoice-cascade-parts-4471-2"), {
    etag: null,
  });
  const result = await run(updatePage, {
    path: COPY,
    edits: [{ find: "flags: []", replace: `flags: []\n${expense.trimEnd()}` }],
  });
  assert.match(result, /^refused: /);
  assert.match(result, /Also seen in/);
});

test("a Record for a different invoice number is created", async () => {
  const result = await run(createPage, {
    path: "summaries/2026-09-12-invoice-cascade-parts-4472.md",
    content: summary(
      "2026-09-12-invoice-cascade-parts-4472",
      expense.replace('"4471"', '"4472"')
    ),
    index_line:
      "- 2026-09-12 invoice: [Invoice 4472](summaries/2026-09-12-invoice-cascade-parts-4472.md): $212.48.",
  });
  assert.match(result, /^Created /);
});
