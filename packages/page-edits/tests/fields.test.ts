import assert from "node:assert/strict";
import { test } from "node:test";
import { pageField, paymentStatus } from "../index";
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
