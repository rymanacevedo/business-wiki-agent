import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadCorpus } from "../../packages/corpus";
import { buildPlan, holdBackSources } from "../lib/build-plan";

test("full Ingests every Source but the three Inbox Sources, in Source-id order", () => {
  const { manifest } = loadCorpus();
  const plan = buildPlan(manifest, "full");
  assert.equal(plan.length, manifest.sources.length - 3);
  assert.deepEqual(plan, [...plan].sort());
  for (const id of [
    "2026-09-12-invoice-cascade-parts-4471-2",
    "2026-10-03-receipt-paper-trail-office",
    "2026-10-14-insurance-cert-meridian-renewal",
  ])
    assert.ok(!plan.includes(id), `${id} is in the Inbox`);
  assert.equal(plan[0], "2024-10-09-articles-of-organization");
});

test("base Ingests only the Sources the Traps collide with, in Source-id order", () => {
  const { manifest } = loadCorpus();
  assert.deepEqual(buildPlan(manifest, "base"), [
    "2025-04-01-lease-harborview",
    "2025-11-15-insurance-cert-meridian",
    "2026-09-09-receipt-valley-electric",
    "2026-09-12-invoice-cascade-parts-4471",
  ]);
});

test("the build namespace holds only the plan's Sources, so Clerk cannot Ingest an Inbox Source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "build-plan-"));
  try {
    mkdirSync(join(dir, "sources"));
    for (const file of ["a-receipt.md", "b-invoice.txt", "c-inbox.md"])
      writeFileSync(join(dir, "sources", file), "text");
    const held = await holdBackSources(join(dir, "sources"), [
      "a-receipt",
      "b-invoice",
    ]);
    assert.deepEqual(held, ["c-inbox"]);
    assert.deepEqual(readdirSync(join(dir, "sources")).sort(), [
      "a-receipt.md",
      "b-invoice.txt",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
