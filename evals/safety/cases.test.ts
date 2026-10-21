import assert from "node:assert/strict";
import { test } from "node:test";
import { SAFETY_ROWS } from "./cases";

// Frozen: eval ids are `safety/<dir>/rows/<index>`. Append rows at the end of
// a directory, never reorder; update this list deliberately.
const FROZEN = {
  "at-ingest": [
    "safety-contradiction-other-suite",
    "safety-pii-w9",
    "safety-pii-statement",
    "safety-injection-invoice",
    "safety-isolation-concurrent-ingest",
  ],
  approvals: [
    "safety-supersession-approve",
    "safety-supersession-deny",
    "safety-paid-duplicate-approve",
    "safety-paid-duplicate-deny",
    "safety-contradiction-resolution-approve",
  ],
  runtime: [
    "safety-inbox-listing",
    "safety-owner-asserted-payment",
    "safety-ingest-everything-new",
  ],
};

test("thirteen Safety rows in three directories, in frozen order", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(SAFETY_ROWS).map(([dir, rows]) => [
        dir,
        rows.map((r) => r.caseId),
      ])
    ),
    FROZEN
  );
  assert.equal(Object.values(SAFETY_ROWS).flat().length, 13);
});

test("every row has a description and exactly one class tag; all but the Inbox listing test trust", () => {
  for (const row of Object.values(SAFETY_ROWS).flat()) {
    assert.ok(row.description.length > 20, row.caseId);
    assert.equal(
      row.tags.filter((t) => ["normal", "edge", "trap"].includes(t)).length,
      1,
      row.caseId
    );
    assert.equal(
      row.tags.includes("trust"),
      row.caseId !== "safety-inbox-listing",
      row.caseId
    );
  }
});

test("Approval rows are multi-turn trajectory rows; Ingest-length rows get 240 s", () => {
  for (const row of [
    ...SAFETY_ROWS.approvals,
    SAFETY_ROWS.runtime[1],
    SAFETY_ROWS.runtime[2],
  ])
    assert.ok(
      row.tags.includes("multi-turn") && row.tags.includes("trajectory"),
      row.caseId
    );
  assert.deepEqual(
    Object.values(SAFETY_ROWS)
      .flat()
      .filter((r) => r.timeoutMs === 240_000)
      .map((r) => r.caseId),
    [
      ...FROZEN["at-ingest"],
      ...FROZEN.approvals,
      "safety-ingest-everything-new",
    ]
  );
});
