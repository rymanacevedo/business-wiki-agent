import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { loadCorpus, type ManifestEntry } from "../../corpus";
import { readWikiDir } from "../../wiki-check";
import { checkIngest, type IngestResult } from "../index";

// The `full` and `base` fixtures are Wikis Clerk built and the Owner reviewed
// (fixtures/REVIEW.md), so `base -> full` is a known Ingest of each Source,
// including the known defects listed in fixtures/REVIEW.md.
const FIXTURES = resolve(__dirname, "../../../fixtures");
const wikis = Promise.all([
  readWikiDir(`${FIXTURES}/base`),
  readWikiDir(`${FIXTURES}/full`),
  loadCorpus(),
]);

async function ingestOf(id: string): Promise<IngestResult> {
  const [base, full, corpus] = await wikis;
  const entry = corpus.manifest.sources.find((s) => s.id === id);
  assert.ok(entry, `no Manifest entry ${id}`);
  return checkIngest(entry as ManifestEntry, { before: base, after: full });
}

const failed = (result: IngestResult) => ({
  gates: result.gates.filter((c) => !c.passed).map((c) => c.name),
  extraction: result.extraction.checks
    .filter((c) => !c.passed)
    .map((c) => c.name),
});

test("a plain receipt Ingested right passes every gate with full extraction", async () => {
  const result = await ingestOf("2026-08-03-receipt-harbor-hardware");

  assert.deepEqual(failed(result), { gates: [], extraction: [] });
  assert.deepEqual(
    result.gates.map((c) => c.name),
    ["page", "amount", "categories"]
  );
  assert.equal(result.extraction.score, 1);
  assert.equal(
    result.summary,
    "summaries/2026-08-03-receipt-harbor-hardware.md"
  );
});

test("a Source with no summary Page fails the page gate and finds nothing it wrote", async () => {
  const [base, , corpus] = await wikis;
  const entry = corpus.manifest.sources.find(
    (s) => s.id === "2026-08-11-receipt-portside-fuel"
  )!;
  const result = checkIngest(entry, { before: base, after: base });

  assert.deepEqual(failed(result).gates, ["page", "amount", "categories"]);
  // Writing nothing stores no urgency word; that is the only check it passes.
  assert.deepEqual(
    result.extraction.checks.filter((c) => c.passed).map((c) => c.name),
    ["no urgency words"]
  );
  assert.equal(result.summary, null);
});

test("the out-of-scope grocery receipt passes: one personal Allocation, in no business Ledger", async () => {
  const result = await ingestOf("2026-09-20-receipt-freshway-market");

  assert.deepEqual(failed(result), { gates: [], extraction: [] });
  assert.deepEqual(
    result.gates.map((c) => c.name),
    ["page", "amount", "personal-only", "no-business-ledger"]
  );
});

test("the out-of-scope grocery receipt filed under supplies fails both personal gates", async () => {
  const [base, full, corpus] = await wikis;
  const id = "2026-09-20-receipt-freshway-market";
  const entry = corpus.manifest.sources.find((s) => s.id === id)!;
  const path = `summaries/${id}.md`;
  const after = new Map(full);
  after.set(
    path,
    full.get(path)!.replace("category: personal", "category: supplies")
  );
  after.set(
    "expenses/supplies.md",
    `${full.get("expenses/supplies.md")}\n- [Freshway](../${path})\n`
  );
  const result = checkIngest(entry, { before: base, after });

  assert.deepEqual(failed(result).gates, [
    "personal-only",
    "no-business-ledger",
  ]);
});

test("the personal dentist bill passes: one personal Allocation, in no business Ledger", async () => {
  const result = await ingestOf("2026-09-29-bill-bayside-dental");

  assert.deepEqual(failed(result).gates, []);
  assert.ok(result.gates.some((c) => c.name === "no-business-ledger"));
});

test("the ambiguous hardware receipt passes with two Allocations in supplies and equipment", async () => {
  // Split by line item, as the Manifest's own Allocations are: no needs-owner
  // flag, so no FLAG line is expected.
  const result = await ingestOf("2026-09-18-receipt-harbor-hardware");

  assert.deepEqual(failed(result), { gates: [], extraction: [] });
  assert.ok(result.gates.some((c) => c.name === "ambiguous-categories"));
});

test("the duplicate receipt adds no Record", async () => {
  const result = await ingestOf("2026-09-09-receipt-valley-electric-2");

  assert.deepEqual(failed(result), { gates: [], extraction: [] });
  assert.deepEqual(
    result.gates.map((c) => c.name),
    ["page", "no-new-record"]
  );
});

test("the past-deadline permit keeps its active expiry Obligation and its fee in other", async () => {
  const result = await ingestOf("2025-10-01-permit-city-clerk");

  assert.deepEqual(failed(result).gates, []);
  assert.ok(
    result.gates.some((c) => c.name === "past-deadline-obligation" && c.passed)
  );
});

test("a bank statement is a summary, not a Record, and is noted on the Records it matches", async () => {
  const result = await ingestOf("2026-09-30-bank-statement-tidewater");

  assert.deepEqual(failed(result).gates, []);
  assert.deepEqual(
    result.gates.map((c) => c.name),
    ["page", "no-new-record"]
  );
  // Only valley-electric's Record is in `base`; the others were never there to match.
  const seen = result.extraction.checks.filter((c) =>
    c.name.startsWith("also-seen-in")
  );
  assert.deepEqual(
    seen.map((c) => [c.name, c.passed]),
    [["also-seen-in 2026-09-09-receipt-valley-electric", true]]
  );
});

test("a lease Ingest's late notice Obligation and missing facts cost extraction, not a gate", async () => {
  const [, full, corpus] = await wikis;
  const entry = corpus.manifest.sources.find(
    (s) => s.id === "2025-04-01-lease-harborview"
  )!;
  const empty = new Map<string, string>();
  assert.deepEqual(failed(checkIngest(entry, { before: empty, after: full })), {
    gates: [],
    extraction: [],
  });
  // The first fixture build's defects: notice due 2027-01-01, no landlord on
  // the Profile, no MILESTONE line.
  const notice = "obligations/2026-12-31-lease-notice-harborview.md";
  const after = new Map(full);
  after.delete(notice);
  after.set(
    "obligations/2027-01-01-lease-notice-harborview.md",
    full.get(notice)!.replace("due: 2026-12-31", "due: 2027-01-01")
  );
  after.set(
    "profile.md",
    full
      .get("profile.md")!
      .split("\n")
      .map((line) =>
        line.includes("(src: 2025-04-01-lease-harborview)")
          ? line.replace("Harborview Properties LLC", "the landlord")
          : line
      )
      .join("\n")
  );
  after.set(
    "log.md",
    full.get("log.md")!.replace(/^.* MILESTONE \[2025-04-01\].*\n/m, "")
  );
  const result = checkIngest(entry, { before: empty, after });

  assert.deepEqual(failed(result).gates, []);
  assert.deepEqual(failed(result).extraction, [
    "obligation lease-notice 2026-12-31",
    "profile landlord",
    "log MILESTONE [2025-04-01]",
  ]);
  assert.ok(result.extraction.score > 0.5 && result.extraction.score < 1);
});

test("an urgency word stored on a Page the Source touched costs extraction", async () => {
  const [base, full, corpus] = await wikis;
  const id = "2026-08-03-receipt-harbor-hardware";
  const entry = corpus.manifest.sources.find((s) => s.id === id)!;
  const path = `summaries/${id}.md`;
  const after = new Map(full);
  after.set(path, `${full.get(path)}\n\nThis receipt is overdue for review.\n`);
  const result = checkIngest(entry, { before: base, after });

  assert.deepEqual(failed(result).extraction, ["no urgency words"]);
});

test("Profile facts must be on the Profile with the Source's Citation", async () => {
  const [, full, corpus] = await wikis;
  const entry = corpus.manifest.sources.find(
    (s) => s.id === "2024-10-21-ein-letter"
  )!;
  const result = checkIngest(entry, { before: new Map(), after: full });
  const facts = result.extraction.checks.filter((c) =>
    c.name.startsWith("profile ")
  );

  assert.ok(facts.some((c) => c.name === "profile ein" && c.passed));
});

test("a Profile fact already stated before the Ingest, under another Citation, counts", async () => {
  const [, full, corpus] = await wikis;
  const entry = corpus.manifest.sources.find(
    (s) => s.id === "2024-10-21-ein-letter"
  )!;
  const asIs = checkIngest(entry, { before: new Map(), after: full });
  const known = checkIngest(entry, { before: full, after: full });
  const owner = (r: IngestResult) =>
    r.extraction.checks.find((c) => c.name === "profile owner")?.passed;

  assert.equal(owner(asIs), false);
  assert.equal(owner(known), true);
});

test("an Ingest parked on its Approval is not scored on what comes after the Owner answers", async () => {
  // The renewed certificate parks on its Supersession: the new Obligation and
  // the INGEST line are written only once the Owner answers.
  const [base, , corpus] = await wikis;
  const entry = corpus.manifest.sources.find(
    (s) => s.id === "2026-10-14-insurance-cert-meridian-renewal"
  )!;
  const names = (r: IngestResult) => r.extraction.checks.map((c) => c.name);

  assert.deepEqual(names(checkIngest(entry, { before: base, after: base })), [
    "obligation insurance-renewal 2027-11-15",
    "profile insurer",
    "one INGEST line",
    "no urgency words",
  ]);
  assert.deepEqual(
    names(checkIngest(entry, { before: base, after: base }, { parked: true })),
    ["profile insurer", "no urgency words"]
  );
});
