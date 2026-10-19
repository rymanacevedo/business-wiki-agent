import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { loadCorpus } from "../../../packages/corpus";
import { checkWiki, readWikiDir } from "../../../packages/wiki-check";
import { seedNamespace } from "../../../packages/wiki-store/seed";
import listSources from "../../tools/list_sources";

// The committed fixtures are Clerk's own output (bun run wiki:build-fixture).
// They are what the demo and the evals start from, so they must hold the
// Schema's standing rules and the shape the eval dataset expects.

const FIXTURES = resolve(__dirname, "../../../fixtures");
const SOURCES = resolve(__dirname, "../../../corpus/sources");
const root = mkdtempSync(join(tmpdir(), "clerk-fixtures-"));
after(() => rmSync(root, { recursive: true, force: true }));

for (const fixture of ["full", "base"])
  test(`the ${fixture} fixture passes every wiki check`, async () => {
    assert.deepEqual(checkWiki(await readWikiDir(join(FIXTURES, fixture))), []);
  });

test("list_sources on a namespace seeded with full reports exactly the Inbox Sources", async () => {
  await seedNamespace({
    namespace: "full",
    fixtureDir: join(FIXTURES, "full"),
    sourcesDir: SOURCES,
    env: { WIKI_STORE_DIR: root },
  });
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "full";
  const { inbox, ingested } = (await listSources.execute({}, {} as never)) as {
    inbox: string[];
    ingested: string[];
  };
  const { manifest } = loadCorpus();
  assert.deepEqual(inbox, [
    "2026-09-12-invoice-cascade-parts-4471-2",
    "2026-10-03-receipt-paper-trail-office",
    "2026-10-14-insurance-cert-meridian-renewal",
  ]);
  assert.equal(ingested.length, manifest.sources.length - 3);
});

test("base holds only the Pages the Ingest Traps collide with", async () => {
  const pages = await readWikiDir(join(FIXTURES, "base"));
  const paths = [...pages.keys()];
  const summaries = paths.filter((p) => p.startsWith("summaries/"));
  assert.deepEqual(summaries, [
    "summaries/2025-04-01-lease-harborview.md",
    "summaries/2025-11-15-insurance-cert-meridian.md",
    "summaries/2026-09-09-receipt-valley-electric.md",
    "summaries/2026-09-12-invoice-cascade-parts-4471.md",
  ]);
  const obligations = paths.filter((p) => p.startsWith("obligations/"));
  assert.equal(obligations.length, 3, obligations.join(", "));
  for (const pattern of [/lease/, /insurance/, /4471/])
    assert.ok(
      obligations.some((p) => pattern.test(p)),
      String(pattern)
    );
  for (const p of ["SCHEMA.md", "index.md", "log.md", "profile.md"])
    assert.ok(paths.includes(p), p);
  // Every Allocation of a Record has a Ledger row, so the two Records bring
  // their Ledgers; those list nothing but base Records.
  const ledgers = paths.filter((p) => p.startsWith("expenses/"));
  for (const ledger of ledgers)
    for (const [, target] of pages
      .get(ledger)!
      .matchAll(/\(\.\.\/(summaries\/[^)]+\.md)\)/g))
      assert.ok(summaries.includes(target), `${ledger} lists ${target}`);
  const others = paths.filter(
    (p) =>
      p.includes("/") && !/^(summaries|obligations|entities|expenses)\//.test(p)
  );
  assert.deepEqual(others, []);
});
