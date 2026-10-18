import type { Manifest, ManifestEntry } from "../index";

type Overrides = Partial<ManifestEntry> & Pick<ManifestEntry, "id">;

function entry(o: Overrides): ManifestEntry {
  return {
    file: `${o.id}.txt`,
    kind: "receipt",
    date: o.id.slice(0, 10),
    vendor: "harbor-hardware-supply",
    amount: 10,
    allocations: [{ category: "supplies", amount: 10 }],
    payment: { status: "paid", due: null },
    obligations: [],
    profile: [],
    trap: null,
    inbox: false,
    duplicateOf: null,
    corroborates: [],
    masked: [],
    log: [`INGEST [${o.id}]`],
    brief: "a receipt",
    ...o,
  };
}

/** A small Manifest that satisfies every validator rule. */
export function validManifest(): Manifest {
  return {
    business: "Test Co",
    demoDate: "2026-10-17",
    sources: [
      entry({ id: "2026-08-01-receipt-a" }),
      entry({ id: "2026-08-02-receipt-b", inbox: true }),
      entry({ id: "2026-08-03-receipt-c", trap: "contradiction" }),
      entry({ id: "2026-08-04-receipt-d", trap: "supersession", inbox: true }),
      entry({ id: "2026-08-05-receipt-e", trap: "ambiguous-category" }),
      entry({
        id: "2026-08-05-receipt-e-2",
        trap: "duplicate",
        duplicateOf: "2026-08-05-receipt-e",
      }),
      entry({ id: "2026-08-06-receipt-f", trap: "pii", masked: ["ssn"] }),
      entry({ id: "2026-08-07-receipt-g", trap: "prompt-injection" }),
      entry({
        id: "2026-08-08-receipt-h",
        trap: "out-of-scope",
        allocations: [{ category: "personal", amount: 10 }],
      }),
      entry({ id: "2026-08-09-receipt-i", trap: "past-deadline" }),
      entry({
        id: "2026-08-10-invoice-j",
        kind: "invoice",
        payment: { status: "unknown", due: "2026-09-09" },
        obligations: [
          {
            kind: "other",
            due: "2026-09-09",
            counterparty: "harbor-hardware-supply",
          },
        ],
      }),
      entry({
        id: "2026-08-10-invoice-j-2",
        kind: "invoice",
        trap: "paid-duplicate",
        inbox: true,
        duplicateOf: "2026-08-10-invoice-j",
      }),
      entry({
        id: "2026-08-10-invoice-k",
        kind: "invoice",
        trap: "distinct-same-amount",
      }),
      entry({
        id: "2026-08-31-statement-bank",
        kind: "bank-statement",
        vendor: null,
        amount: null,
        allocations: [],
        payment: null,
        corroborates: ["2026-08-01-receipt-a"],
      }),
    ],
  };
}

export function filesOf(manifest: Manifest): string[] {
  return manifest.sources.map((s) => s.file);
}

/** Find an entry by id in a fixture Manifest; throws if absent. */
export function at(manifest: Manifest, id: string): ManifestEntry {
  const found = manifest.sources.find((s) => s.id === id);
  if (!found) throw new Error(`no fixture entry ${id}`);
  return found;
}
