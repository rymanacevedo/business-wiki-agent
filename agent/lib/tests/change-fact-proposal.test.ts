import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore } from "../../../packages/wiki-store";
import changeFact from "../../tools/change_fact";

// change_fact's input schema checks a proposal before the Approval gate, so
// the Owner never sees a card that cannot apply or that leaves the payment
// Obligation open when a Record is marked paid.

const RECORD = "summaries/2026-09-12-invoice-cascade-parts-4471.md";
const OBLIGATION = "obligations/2026-10-12-pay-invoice-cascade-4471.md";

const record = `---
title: Cascade Appliance Parts invoice 4471
kind: summary
sources: [2026-09-12-invoice-cascade-parts-4471]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
expense:
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
---

# Cascade Appliance Parts invoice 4471
`;

const obligation = `---
title: Pay Cascade Appliance Parts invoice 4471
kind: obligation
obligation: other
due: 2026-10-12
counterparty: cascade-appliance-parts
recurs: none
sources: [2026-09-12-invoice-cascade-parts-4471]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Pay Cascade Appliance Parts invoice 4471

- **Record**: [invoice 4471](../${RECORD})
- **Status**: active
`;

const markPaid = {
  page: RECORD,
  old_value: "status: unknown\n    due: 2026-10-12\n    evidence: []",
  new_value:
    "status: paid\n    due: 2026-10-12\n    evidence: [2026-09-12-invoice-cascade-parts-4471-2]",
};
const closeObligation = {
  page: OBLIGATION,
  old_value: "status: active\nflags: []",
  new_value: "status: done\ndone_on: 2026-10-14\nflags: []",
};

let root = "";
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "change-fact-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  const store = createWikiStore({ namespace: "t" });
  await store.write(RECORD, record, { etag: null });
  await store.write(OBLIGATION, obligation, { etag: null });
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

type Result = { issues?: { message: string }[] };
async function check(changes: unknown[]): Promise<string[]> {
  const schema = changeFact.inputSchema as unknown as {
    "~standard": { validate: (v: unknown) => Promise<Result> | Result };
  };
  const result = await schema["~standard"].validate({
    changes,
    source: "2026-09-12-invoice-cascade-parts-4471-2",
    reason: "The copy carries a PAID stamp.",
  });
  return (result.issues ?? []).map((issue) => issue.message);
}

test("a proposal that marks the Record paid and closes its payment Obligation reaches the Owner", async () => {
  assert.deepEqual(await check([markPaid, closeObligation]), []);
});

test("marking a Record paid while its payment Obligation stays active is sent back to Clerk", async () => {
  const [problem] = await check([markPaid]);
  assert.match(problem, /stays active/);
  assert.match(problem, new RegExp(OBLIGATION));
});

test("an old value that is not on the Page is sent back to Clerk", async () => {
  const problems = await check([{ ...markPaid, old_value: "status: overdue" }]);
  assert.equal(problems.length, 1);
});

test("a change to a Page that does not exist is sent back to Clerk", async () => {
  const [problem] = await check([{ ...markPaid, page: "summaries/nope.md" }]);
  assert.match(problem, /No Page at summaries\/nope\.md/);
});

test("a payment Obligation that cites the invoice but does not link the Record still has to close", async () => {
  const store = createWikiStore({ namespace: "t" });
  const current = await store.read(OBLIGATION);
  await store.write(
    OBLIGATION,
    obligation.replace(`- **Record**: [invoice 4471](../${RECORD})\n`, ""),
    { etag: current!.etag }
  );
  const [problem] = await check([markPaid]);
  assert.match(problem ?? "", /stays active/);
});

const hideStatus = {
  page: OBLIGATION,
  old_value: "- **Status**: active",
  new_value: "<!-- - **Status**: active -->\n- **Status**: done",
};

test("an approved change cannot hide a fact line in an HTML comment", async () => {
  const [problem] = await check([hideStatus]);
  assert.match(problem ?? "", /raw HTML/);
});

test("a Page already invalid for another reason still cannot gain hidden text", async () => {
  const store = createWikiStore({ namespace: "t" });
  const current = await store.read(OBLIGATION);
  await store.write(
    OBLIGATION,
    obligation.replace(
      "- **Status**: active",
      "- **Status**: active\n- **Note**: uncited"
    ),
    { etag: current!.etag }
  );
  const [problem] = await check([hideStatus]);
  assert.match(problem ?? "", /raw HTML/);
});
