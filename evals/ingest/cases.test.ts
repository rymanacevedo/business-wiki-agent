import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { loadCorpus } from "../../packages/corpus";
import { ingestCases } from "./cases";

const baseIngested = new Set(
  readdirSync(resolve(__dirname, "../../fixtures/base/summaries")).map((f) =>
    f.replace(/\.md$/, "")
  )
);

// Frozen: eval ids are `ingest/sources/<index>`. Append new Sources at the
// end of the Manifest, never reorder; update this list deliberately.
const FROZEN = [
  "2024-10-09-articles-of-organization",
  "2024-10-10-operating-agreement",
  "2024-10-21-ein-letter",
  "2024-11-04-sales-tax-registration",
  "2025-10-01-permit-city-clerk",
  "2026-02-20-w9-northwind",
  "2026-03-01-service-agreement-bayview",
  "2026-03-02-insurance-cert-meridian-bayview",
  "2026-04-01-business-license",
  "2026-08-03-receipt-harbor-hardware",
  "2026-08-11-receipt-portside-fuel",
  "2026-08-14-receipt-paper-trail-office",
  "2026-08-20-invoice-ridgeline-tools-r20931",
  "2026-08-22-receipt-dockside-deli",
  "2026-08-31-bank-statement-tidewater",
  "2026-09-01-invoice-lumen-sites-hosting",
  "2026-09-02-receipt-portside-fuel",
  "2026-09-09-receipt-valley-electric-2",
  "2026-09-12-invoice-cascade-parts-4471-2",
  "2026-09-12-invoice-cascade-parts-4472",
  "2026-09-15-receipt-portside-power",
  "2026-09-18-receipt-harbor-hardware",
  "2026-09-20-receipt-freshway-market",
  "2026-09-24-receipt-dockside-deli",
  "2026-09-29-bill-bayside-dental",
  "2026-09-30-bank-statement-tidewater",
  "2026-10-02-invoice-eastside-auto-3381",
  "2026-10-03-receipt-paper-trail-office",
  "2026-10-09-receipt-portside-fuel",
  "2026-10-14-insurance-cert-meridian-renewal",
];

test("one Ingest case per Source not in base, in frozen order", async () => {
  const { manifest } = await loadCorpus();
  const cases = ingestCases(manifest, baseIngested);

  assert.deepEqual(
    cases.map((c) => c.entry.id),
    FROZEN
  );
  assert.ok(cases.every((c) => c.caseId === `ingest-${c.entry.id}`));
  assert.ok(
    cases.every((c) => c.description.startsWith(`Ingest ${c.entry.id} (`))
  );
});

test("every case has exactly one class tag; Traps are trap, statements edge", async () => {
  const { manifest } = await loadCorpus();
  const cases = ingestCases(manifest, baseIngested);
  const byId = new Map(cases.map((c) => [c.entry.id, c]));

  for (const c of cases)
    assert.equal(
      c.tags.filter((t) => ["normal", "edge", "trap"].includes(t)).length,
      1,
      c.caseId
    );
  assert.deepEqual(byId.get("2026-08-03-receipt-harbor-hardware")?.tags, [
    "normal",
    "trajectory",
  ]);
  assert.deepEqual(byId.get("2026-08-31-bank-statement-tidewater")?.tags, [
    "edge",
    "trajectory",
  ]);
  assert.deepEqual(byId.get("2026-10-02-invoice-eastside-auto-3381")?.tags, [
    "trap",
    "trajectory",
    "trust",
  ]);
  assert.deepEqual(byId.get("2026-09-20-receipt-freshway-market")?.tags, [
    "trap",
    "trajectory",
  ]);
});

test("only the Supersession and the PAID duplicate expect an Approval against base", async () => {
  const { manifest } = await loadCorpus();
  const approvals = ingestCases(manifest, baseIngested)
    .filter((c) => c.expectsApproval)
    .map((c) => c.entry.id);

  assert.deepEqual(approvals, [
    "2026-09-12-invoice-cascade-parts-4471-2",
    "2026-10-14-insurance-cert-meridian-renewal",
  ]);
});
