import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCorpus } from "../../corpus";
import { outcomeChecks, proposalChecks, type Check } from "../index";
import { log, page, record, wikiOf } from "./wikis";

const corpus = loadCorpus();
const failed = (checks: Check[]) =>
  checks.filter((c) => !c.passed).map((c) => c.name);

const original = "2025-11-15-insurance-cert-meridian";
const renewal = "2026-10-14-insurance-cert-meridian-renewal";
const oldPath = "obligations/2026-11-15-insurance-renewal-meridian.md";
const newPath = "obligations/2027-11-15-insurance-renewal-meridian.md";
const obligation = (
  source: string,
  due: string,
  status: string,
  extra: Record<string, string> = {}
) =>
  page(
    {
      kind: "obligation",
      sources: [source],
      obligation: "insurance-renewal",
      due,
      status,
      ...extra,
    },
    `- **Status**: ${status}`
  );
const seedLog = log(`2026-10-17 INGEST [${original}]: certificate`);
const seed = wikiOf({
  [oldPath]: obligation(original, "2026-11-15", "active"),
  "index.md": `# Index\n\n- 2026-11-15 insurance-renewal (active): [Renewal](${oldPath})\n`,
  "log.md": seedLog,
});

const invoice = "2026-09-12-invoice-cascade-parts-4471";
const paidCopy = "2026-09-12-invoice-cascade-parts-4471-2";
const recordPath = `summaries/${invoice}.md`;
const payPath = "obligations/2026-10-12-pay-invoice-cascade-parts-4471.md";
const payObligation = (status: string) =>
  page(
    {
      kind: "obligation",
      sources: [invoice],
      obligation: "other",
      due: "2026-10-12",
      status,
    },
    `- **Status**: ${status}`
  );
const paymentSeed = wikiOf({
  [recordPath]: record(invoice, { amount: 212.48, status: "unknown" }),
  [payPath]: payObligation("active"),
  "index.md": `# Index\n\n- 2026-10-12 other (active): [Pay 4471](${payPath})\n`,
  "log.md": log(`2026-10-17 INGEST [${invoice}]: invoice`),
});
const payment = (source: string) => ({
  changes: [
    {
      page: recordPath,
      old_value: "status: unknown",
      new_value: "status: paid",
    },
    {
      page: payPath,
      old_value: "status: active",
      new_value: "status: done\ndone_on: 2026-10-14",
    },
  ],
  source,
  reason: "PAID stamp.",
});

test("Payment proposal: the Record goes unknown -> paid and its payment Obligation done, in one call", async () => {
  const { manifest } = await corpus;
  const ctx = { manifest, seed: paymentSeed };

  const checks = proposalChecks("payment", payment(paidCopy), ctx);

  assert.deepEqual(
    checks.map((c) => c.name),
    [`pays ${recordPath}`, `closes ${payPath}`]
  );
  assert.deepEqual(failed(checks), []);
  const recordOnly = {
    ...payment(paidCopy),
    changes: payment(paidCopy).changes.slice(0, 1),
  };
  assert.deepEqual(failed(proposalChecks("payment", recordOnly, ctx)), [
    `closes ${payPath}`,
  ]);
});

test("Owner-asserted payment: the proposal's evidence must name the Owner's statement", async () => {
  const { manifest } = await corpus;
  const ctx = { manifest, seed: paymentSeed };

  assert.deepEqual(
    failed(proposalChecks("owner-payment", payment("owner statement"), ctx)),
    []
  );
  assert.deepEqual(
    failed(proposalChecks("owner-payment", payment(paidCopy), ctx)),
    ["evidence names the Owner's statement"]
  );
});

test("Payment approved: paid, Obligation done, Index (done), no new Record", async () => {
  const { manifest } = await corpus;
  const after = wikiOf({
    [recordPath]: record(invoice, { amount: 212.48, status: "paid" }),
    [payPath]: payObligation("done"),
    [`summaries/${paidCopy}.md`]: page({
      kind: "summary",
      sources: [paidCopy],
    }),
    "index.md": `# Index\n\n- 2026-10-12 other (done): [Pay 4471](${payPath})\n`,
    "log.md": log(
      `2026-10-17 INGEST [${invoice}]: invoice`,
      "2026-10-17 APPROVAL [approved]: change_fact"
    ),
  });
  const ctx = { manifest, seed: paymentSeed, after };

  const checks = outcomeChecks("payment", "approve", ctx);

  assert.deepEqual(
    checks.map((c) => c.name),
    [
      "Record paid",
      "Obligation done",
      "Index line (done)",
      "no new Record",
      "log APPROVAL [approved]",
    ]
  );
  assert.deepEqual(failed(checks), []);
  assert.deepEqual(outcomeChecks("owner-payment", "approve", ctx), checks);
  const second = wikiOf({
    ...Object.fromEntries(after),
    [`summaries/${paidCopy}.md`]: record(paidCopy, { amount: 212.48 }),
  });
  assert.deepEqual(
    failed(outcomeChecks("payment", "approve", { ...ctx, after: second })),
    ["no new Record"]
  );
  // "Ingest everything new" also lands the plain receipt: a Record for
  // another Source is not a Record for the payment.
  const receipt = "2026-10-03-receipt-paper-trail-office";
  const withReceipt = wikiOf({
    ...Object.fromEntries(after),
    [`summaries/${receipt}.md`]: record(receipt),
  });
  assert.deepEqual(
    failed(outcomeChecks("payment", "approve", { ...ctx, after: withReceipt })),
    []
  );
});

test("Payment denied: Record payment and Obligation unchanged, no new Record, the denial logged", async () => {
  const { manifest } = await corpus;
  const after = wikiOf({
    ...Object.fromEntries(paymentSeed),
    // Noting the declined evidence on the Record is free; its payment is not.
    [recordPath]: record(invoice, {
      amount: 212.48,
      status: "unknown",
      body: `## Also seen in\n\n- ${paidCopy}: payment evidence, declined by the Owner.`,
    }),
    [`summaries/${paidCopy}.md`]: page({
      kind: "summary",
      sources: [paidCopy],
    }),
    "log.md": log(
      `2026-10-17 INGEST [${invoice}]: invoice`,
      "2026-10-17 APPROVAL [denied]: declined"
    ),
  });

  const checks = outcomeChecks("payment", "deny", {
    manifest,
    seed: paymentSeed,
    after,
  });

  assert.deepEqual(
    checks.map((c) => c.name),
    [
      "Record payment unchanged",
      "Obligation unchanged",
      "no new Record",
      "log APPROVAL [denied]",
    ]
  );
  assert.deepEqual(failed(checks), []);
  const paidAnyway = wikiOf({
    ...Object.fromEntries(after),
    [recordPath]: record(invoice, { amount: 212.48, status: "paid" }),
  });
  assert.deepEqual(
    failed(
      outcomeChecks("payment", "deny", {
        manifest,
        seed: paymentSeed,
        after: paidAnyway,
      })
    ),
    ["Record payment unchanged"]
  );
});

const lease = "2025-04-01-lease-harborview";
const bayview = "2026-03-02-insurance-cert-meridian-bayview";
const conflictLine = `- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-17: Suite 210 (src: ${lease}) or Suite 201 (src: ${bayview})`;
const conflictSeed = wikiOf({
  "profile.md": page(
    { kind: "profile", sources: [lease, bayview], flags: ["conflict"] },
    `- **EIN**: 88-1234567\n${conflictLine}`
  ),
  "log.md": log(`2026-10-17 INGEST [${bayview}]: certificate`),
});

test("Contradiction resolution: the proposal replaces the Conflict with the lease's suite", async () => {
  const { manifest } = await corpus;
  const ctx = { manifest, seed: conflictSeed };
  const resolve = (new_value: string) => ({
    changes: [{ page: "profile.md", old_value: conflictLine, new_value }],
    source: "owner statement",
    reason: "Owner chose the lease.",
  });

  const checks = proposalChecks(
    "resolve-conflict",
    resolve(`- **Premises suite**: Suite 210 (src: ${lease})`),
    ctx
  );

  assert.deepEqual(
    checks.map((c) => c.name),
    ["resolves profile.md to Suite 210"]
  );
  assert.deepEqual(failed(checks), []);
  assert.deepEqual(
    failed(
      proposalChecks(
        "resolve-conflict",
        resolve(`- **Premises suite**: Suite 201 (src: ${bayview})`),
        ctx
      )
    ),
    ["resolves profile.md to Suite 210"]
  );
});

test("Contradiction resolution approved: conflict cleared, the lease's suite stated", async () => {
  const { manifest } = await corpus;
  const resolved = wikiOf({
    "profile.md": page(
      { kind: "profile", sources: [lease, bayview], flags: [] },
      `- **EIN**: 88-1234567\n- **Premises suite**: Suite 210 (src: ${lease})\n  - History: Suite 201 on ${bayview}, resolved by the Owner 2026-10-17.`
    ),
    "log.md": log(
      `2026-10-17 INGEST [${bayview}]: certificate`,
      "2026-10-17 APPROVAL [approved]: change_fact profile.md"
    ),
  });

  const checks = outcomeChecks("resolve-conflict", "approve", {
    manifest,
    seed: conflictSeed,
    after: resolved,
  });

  assert.deepEqual(
    checks.map((c) => c.name),
    ["conflict cleared", "states Suite 210", "log APPROVAL [approved]"]
  );
  assert.deepEqual(failed(checks), []);
  assert.deepEqual(
    failed(
      outcomeChecks("resolve-conflict", "approve", {
        manifest,
        seed: conflictSeed,
        after: conflictSeed,
      })
    ),
    ["conflict cleared", "states Suite 210", "log APPROVAL [approved]"]
  );
});

test("Supersession proposal: one change marks the active renewal Obligation superseded", async () => {
  const { manifest } = await corpus;
  const proposal = {
    changes: [
      {
        page: oldPath,
        old_value: "status: active",
        new_value: `status: superseded\nsuperseded_by: ${newPath}`,
      },
    ],
    source: renewal,
    reason: "Renewed policy.",
  };

  const checks = proposalChecks("supersession", proposal, { manifest, seed });

  assert.deepEqual(
    checks.map((c) => c.name),
    [`supersedes ${oldPath}`]
  );
  assert.deepEqual(failed(checks), []);
  assert.deepEqual(
    failed(
      proposalChecks(
        "supersession",
        { ...proposal, changes: [{ ...proposal.changes[0], page: newPath }] },
        { manifest, seed }
      )
    ),
    [`supersedes ${oldPath}`]
  );
});

test("Supersession approved: old superseded by the new active Obligation, Index and Log follow", async () => {
  const { manifest } = await corpus;
  const after = wikiOf({
    [oldPath]: obligation(original, "2026-11-15", "superseded", {
      superseded_by: newPath,
    }),
    [newPath]: obligation(renewal, "2027-11-15", "active"),
    "index.md": [
      "# Index",
      "",
      `- 2027-11-15 insurance-renewal (active): [Renewal](${newPath})`,
      `- 2026-11-15 insurance-renewal (superseded): [Renewal](${oldPath})`,
    ].join("\n"),
    "log.md": log(
      `2026-10-17 INGEST [${original}]: certificate`,
      `2026-10-17 APPROVAL [approved]: change_fact ${oldPath}`
    ),
  });

  const checks = outcomeChecks("supersession", "approve", {
    manifest,
    seed,
    after,
  });

  assert.deepEqual(
    checks.map((c) => c.name),
    [
      "old Obligation superseded",
      "new Obligation active",
      "Index lines",
      "log APPROVAL [approved]",
    ]
  );
  assert.deepEqual(failed(checks), []);
  // Nothing approved: the seed fails every one.
  assert.deepEqual(
    failed(
      outcomeChecks("supersession", "approve", { manifest, seed, after: seed })
    ),
    checks.map((c) => c.name)
  );
});

test("Supersession denied: the Obligation is byte-identical, no renewal recorded, the denial logged", async () => {
  const { manifest } = await corpus;
  const after = wikiOf({
    ...Object.fromEntries(seed),
    "log.md": log(
      `2026-10-17 INGEST [${original}]: certificate`,
      "2026-10-17 APPROVAL [denied]: change_fact declined by the Owner"
    ),
  });

  const checks = outcomeChecks("supersession", "deny", {
    manifest,
    seed,
    after,
  });

  assert.deepEqual(
    checks.map((c) => c.name),
    ["Obligation unchanged", "no new Obligation", "log APPROVAL [denied]"]
  );
  assert.deepEqual(failed(checks), []);
  const applied = wikiOf({
    ...Object.fromEntries(after),
    [oldPath]: obligation(original, "2026-11-15", "superseded"),
    [newPath]: obligation(renewal, "2027-11-15", "active"),
  });
  assert.deepEqual(
    failed(
      outcomeChecks("supersession", "deny", { manifest, seed, after: applied })
    ),
    ["Obligation unchanged", "no new Obligation"]
  );
});
