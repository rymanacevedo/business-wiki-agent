import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore, type WikiStore } from "../../../packages/wiki-store";
import changeFact from "../../tools/change_fact";
import createPage from "../../tools/create_page";

// The write tools keep the Index in step with the Pages, so an Ingest spends
// no extra model steps on Index bookkeeping: create_page adds the new Page's
// Index line, and change_fact rewrites an Obligation's line to its new status.

type Tool = { execute: (input: unknown, ctx: unknown) => Promise<string> };
const create = createPage as unknown as Tool;
const change = changeFact as unknown as Tool;
const ctx = { messages: [] };

const INDEX = `---
title: Index
kind: index
sources: []
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Index

## Profile

- [Northwind Repair LLC](profile.md): the Business.

## Obligations

- 2026-11-15 insurance-renewal (active): [Insurance policy expires 2026-11-15](obligations/2026-11-15-insurance-renewal-meridian.md)

## Entities

## Expense ledgers

## Sources
`;

const obligation = (due: string, source: string) => `---
title: Insurance policy expires ${due}
kind: obligation
obligation: insurance-renewal
due: ${due}
counterparty: null
recurs: yearly
sources: [${source}]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Insurance policy expires ${due}

- **Due**: ${due} (src: ${source})
`;
const OLD = "obligations/2026-11-15-insurance-renewal-meridian.md";
const NEW = "obligations/2027-11-15-insurance-renewal-meridian.md";
const RENEWAL = "2026-10-14-insurance-cert-meridian-renewal";

let root = "";
let store: WikiStore;
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "index-lines-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  store = createWikiStore({ namespace: "t" });
  await store.write("index.md", INDEX, { etag: null });
  await store.write("log.md", "# Log\n", { etag: null });
  await store.write(
    OLD,
    obligation("2026-11-15", "2025-11-15-insurance-cert-meridian"),
    {
      etag: null,
    }
  );
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const index = async () => (await store.read("index.md"))!.body;

test("create_page adds the new Page's Index line under its section", async () => {
  await create.execute(
    {
      path: NEW,
      content: obligation("2027-11-15", RENEWAL),
      index_line: `- 2027-11-15 insurance-renewal (active): [Insurance policy expires 2027-11-15](${NEW})`,
    },
    ctx
  );
  const lines = (await index()).split("\n");
  const obligations = lines.indexOf("## Obligations");
  assert.equal(
    lines[obligations + 3],
    `- 2027-11-15 insurance-renewal (active): [Insurance policy expires 2027-11-15](${NEW})`
  );
  assert.ok(lines.indexOf("## Entities") > obligations + 3);
});

test("create_page drops an empty trailing summary from the Index line", async () => {
  await create.execute(
    {
      path: NEW,
      content: obligation("2027-11-15", RENEWAL),
      index_line: `- 2027-11-15 insurance-renewal (active): [Insurance policy expires 2027-11-15](${NEW}): `,
    },
    ctx
  );
  assert.match(
    await index(),
    new RegExp(`\\(${NEW.replace(/[.]/g, "\\.")}\\)$`, "m")
  );
});

test("create_page refuses an Index line that does not link the Page or leads with the wrong status, and writes nothing", async () => {
  await assert.rejects(
    create.execute(
      {
        path: NEW,
        content: obligation("2027-11-15", RENEWAL),
        index_line: "- [Insurance policy expires 2027-11-15](obligations/x.md)",
      },
      ctx
    ),
    /index_line/
  );
  await assert.rejects(
    create.execute(
      {
        path: NEW,
        content: obligation("2027-11-15", RENEWAL),
        index_line: `- [Insurance policy expires 2027-11-15](${NEW})`,
      },
      ctx
    ),
    /- 2027-11-15 insurance-renewal \(active\): /
  );
  assert.equal(await store.read(NEW), null);
  assert.equal(await index(), INDEX);
});

test("an approved change_fact rewrites the changed Obligation's Index line to its new status", async () => {
  const result = await change.execute(
    {
      changes: [
        {
          page: OLD,
          old_value: "status: active",
          new_value: `status: superseded\nsuperseded_by: ${NEW}`,
        },
      ],
      source: RENEWAL,
      reason: "The renewed certificate replaces the policy.",
    },
    ctx
  );
  assert.match(result, /Index/);
  assert.match(
    await index(),
    /^- 2026-11-15 insurance-renewal \(superseded\): \[Insurance policy expires 2026-11-15\]\(obligations\/2026-11-15-insurance-renewal-meridian\.md\)$/m
  );
});
