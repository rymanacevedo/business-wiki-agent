import assert from "node:assert/strict";
import { test } from "node:test";
import { expenseFields, pageField, pageSources, paymentStatus } from "../index";
import { obligation, profile, record } from "./fixtures";

test("reads a top-level frontmatter field", () => {
  assert.equal(pageField(obligation, "status"), "active");
  assert.equal(pageField(obligation, "due"), "2026-11-15");
  assert.equal(pageField(obligation, "done_on"), null);
});

test("reads a Record's payment status, or null without an expense block", () => {
  assert.equal(paymentStatus(record), "unknown");
  assert.equal(
    paymentStatus(record.replace("status: unknown", "status: paid")),
    "paid"
  );
  assert.equal(paymentStatus(profile), null);
});

test("lists a Page's Sources in flow or block YAML, empty without any", () => {
  assert.deepEqual(pageSources(record), [
    "2026-09-12-invoice-cascade-parts-4471",
  ]);
  const block = record.replace(
    "sources: [2026-09-12-invoice-cascade-parts-4471]",
    "sources:\n  [\n    2026-09-12-invoice-cascade-parts-4471,\n    2026-09-12-invoice-cascade-parts-4471-2,\n  ]"
  );
  assert.deepEqual(pageSources(block), [
    "2026-09-12-invoice-cascade-parts-4471",
    "2026-09-12-invoice-cascade-parts-4471-2",
  ]);
  assert.deepEqual(
    pageSources(record.replace(/sources: .*/, "sources: []")),
    []
  );
});

test("reads a Record's scalar expense fields, or null without an expense block", () => {
  const fields = expenseFields(record);
  assert.equal(fields?.vendor, "cascade-appliance-parts");
  assert.equal(fields?.date, "2026-09-12");
  assert.equal(fields?.amount, "212.48");
  assert.equal(fields?.document, "4471");
  assert.equal(expenseFields(profile), null);
});
