import assert from "node:assert/strict";
import { test } from "node:test";
import { judgedPages } from "../index";

const WIKI = [
  "index.md",
  "log.md",
  "profile.md",
  "SCHEMA.md",
  "obligations/2026-11-15-insurance-renewal-meridian.md",
  "summaries/2025-11-15-insurance-cert-meridian.md",
  "summaries/2026-09-12-invoice-cascade-parts-4471.md",
  "summaries/2026-09-12-invoice-cascade-parts-4472.md",
  "expenses/supplies.md",
];

test("the judge reads the Index, every Page a cites pattern names, and every Page the answer links", () => {
  const pages = judgedPages(
    [["obligations/2026-11-15-", "2025-11-15-insurance-cert-meridian"]],
    "Renews 2026-11-15 with Meridian " +
      "([renewal](/wiki/obligations/2026-11-15-insurance-renewal-meridian.md)); " +
      "see also [Supplies](/wiki/expenses/supplies.md).",
    WIKI
  );

  assert.deepEqual(pages, [
    "expenses/supplies.md",
    "index.md",
    "obligations/2026-11-15-insurance-renewal-meridian.md",
    "summaries/2025-11-15-insurance-cert-meridian.md",
  ]);
});

test("a Source id names its summary Page; links to Pages the Wiki lacks are dropped", () => {
  const pages = judgedPages(
    ["2026-09-12-invoice-cascade-parts-4471"],
    "Unpaid (src: 2026-09-12-invoice-cascade-parts-4471), " +
      "[made up](/wiki/obligations/nowhere.md)",
    WIKI
  );

  assert.deepEqual(pages, [
    "index.md",
    "summaries/2026-09-12-invoice-cascade-parts-4471.md",
  ]);
});
