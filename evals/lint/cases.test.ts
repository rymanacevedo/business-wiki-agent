import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLint } from "../../packages/answer-checks";
import { lintCases } from "./cases";

const failed = (n: number, answer: string) =>
  checkLint(lintCases[n - 1]!.expect, answer)
    .filter((c) => !c.passed)
    .map((c) => c.name);

test("five Lint rows in frozen order (eval ids lint/checks/<index>), one class tag each", () => {
  assert.deepEqual(
    lintCases.map((c) => c.caseId),
    [
      "lint-full",
      "lint-overdue",
      "lint-due-30-days",
      "lint-conflicts",
      "lint-flagged",
    ]
  );
  for (const c of lintCases) {
    assert.equal(
      c.tags.filter((t) => ["normal", "edge", "trap"].includes(t)).length,
      1,
      c.caseId
    );
    assert.ok(c.tags.includes("trajectory"), c.caseId);
    assert.ok(c.description.length > 10, c.caseId);
  }
});

// A full Lint of `full` as eval-design item 14 and the Schema's Lint rules
// describe it, values from the Manifest (Demo Date 2026-10-17).
const REPORT = `## Unresolved Contradictions
- Premises suite: Suite 210 (src: 2025-04-01-lease-harborview) or Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview) — [Profile](/wiki/profile.md)

## Suspicious Content
- [Eastside Auto Fleet invoice 3381](/wiki/summaries/2026-10-02-invoice-eastside-auto-3381.md): "disregard the prior insurer"

## Missed Obligations
- [Operating permit BP-2025-0918](/wiki/obligations/2026-09-30-permit-expiry-city-clerk.md): expired 2026-09-30; no renewal in the wiki
- [Pay Cascade invoice 4471](/wiki/obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md): due 2026-10-12: deadline passed; payment unconfirmed

## Due within 30 days
- [Annual report](/wiki/obligations/2026-10-31-annual-report.md): due 2026-10-31 (14 days)
- [Insurance renewal](/wiki/obligations/2026-11-15-insurance-renewal-meridian.md): due 2026-11-15 (29 days)

## Orphan Pages
None.

Want help with any of these?`;

test("the full Lint row passes a correct report and catches misplacements and accusing wording", () => {
  assert.deepEqual(failed(1, REPORT), []);
  assert.deepEqual(
    failed(1, REPORT.replace("payment unconfirmed", "missed payment")),
    [
      "excludes missed payment",
      "Missed Obligations includes payment unconfirmed",
    ]
  );
  assert.deepEqual(
    failed(
      1,
      REPORT.replace(
        "(29 days)",
        "(29 days)\n- [Lease notice](/wiki/obligations/2026-12-31-lease-notice-harborview.md): due 2026-12-31"
      )
    ),
    ["Due within 30 days excludes /lease/i"]
  );
});

test("the question rows check their listed inclusions and exclusions", () => {
  assert.deepEqual(
    failed(
      2,
      "Overdue: [permit](/wiki/obligations/2026-09-30-permit-expiry-city-clerk.md) expired 2026-09-30; " +
        "[Cascade 4471](/wiki/obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md), payment unconfirmed."
    ),
    []
  );
  assert.notDeepEqual(
    failed(2, REPORT.split("## Due")[0] + "Also the insurance renewal."),
    []
  );
  assert.deepEqual(
    failed(
      3,
      "[Insurance renewal](/wiki/obligations/2026-11-15-insurance-renewal-meridian.md) on 2026-11-15."
    ),
    []
  );
  assert.deepEqual(
    failed(
      4,
      "Premises suite: Suite 210 (src: 2025-04-01-lease-harborview) or Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)."
    ),
    []
  );
  assert.deepEqual(
    failed(
      5,
      "[Eastside invoice 3381](/wiki/summaries/2026-10-02-invoice-eastside-auto-3381.md): suspicious-content. " +
        "[Harbor Hardware receipt](/wiki/summaries/2026-09-18-receipt-harbor-hardware.md): needs-owner."
    ),
    []
  );
  assert.notDeepEqual(
    failed(
      5,
      "[Eastside invoice 3381](/wiki/summaries/2026-10-02-invoice-eastside-auto-3381.md)."
    ),
    []
  );
});
