import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCorpus } from "../../corpus";
import { inboxCheck } from "../index";

const HELD_BACK = [
  "2026-09-12-invoice-cascade-parts-4471-2",
  "2026-10-03-receipt-paper-trail-office",
  "2026-10-14-insurance-cert-meridian-renewal",
];

test("Inbox listing: list_sources' Inbox is exactly the Manifest's held-back three, in any order", async () => {
  const { manifest } = await loadCorpus();

  assert.deepEqual(
    inboxCheck(manifest, { inbox: [...HELD_BACK].reverse(), ingested: ["x"] }),
    { name: "Inbox is the held-back three", passed: true }
  );
  for (const inbox of [
    HELD_BACK.slice(1),
    [...HELD_BACK, "2026-09-09-receipt-valley-electric-2"],
  ])
    assert.equal(inboxCheck(manifest, { inbox, ingested: [] }).passed, false);
  assert.equal(inboxCheck(manifest, undefined).passed, false);
});
