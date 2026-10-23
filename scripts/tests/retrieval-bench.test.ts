import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { ResultPage } from "../../packages/wiki-retrieval";
import { createWikiStore, type WikiStore } from "../../packages/wiki-store";
import {
  benchRows,
  choose,
  DEFAULTS,
  rankRow,
  renderBench,
  runBench,
} from "../lib/retrieval-bench";

const page = (
  path: string,
  role: ResultPage["role"] = "match"
): ResultPage => ({
  path,
  title: path,
  kind: "summary",
  status: "active",
  role,
  score: 1,
});

describe("a row's reciprocal rank", () => {
  const result = [
    page("entities/cascade.md"),
    page("summaries/2026-09-12-invoice-4471.md"),
    page("obligations/2026-10-12-pay-4471.md"),
    page("profile.md", "neighbour"),
  ];

  test("one required entry: 1 over its position", () => {
    assert.equal(rankRow(["invoice-4471"], result).rr, 1 / 2);
  });

  test("several required entries: 1 over the position of the last to appear", () => {
    assert.equal(rankRow(["profile.md", "cascade"], result).rr, 1 / 4);
  });

  test("an any-of entry counts at the best position of its alternatives", () => {
    const row = rankRow([["obligations/2026-10-12-", "entities/"]], result);
    assert.equal(row.rr, 1);
    assert.deepEqual(
      row.entries.map((e) => e.position),
      [1]
    );
  });

  test("a required entry missing from the result scores 0", () => {
    const row = rankRow(["invoice-4471", "lease-harborview"], result);
    assert.equal(row.rr, 0);
    assert.equal(row.entries[1]?.position, null);
  });

  test("a Source id finds its summary Page by substring, case-insensitively", () => {
    assert.equal(rankRow(["2026-09-12-INVOICE-4471"], result).rr, 1 / 2);
  });

  test("a neighbour reaches an entry by the hop; a Match by the result's Rung", () => {
    const row = rankRow(["invoice-4471", "profile.md"], result, {
      rung: "embedding",
      lexicalMatches: ["summaries/2026-09-12-invoice-4471.md"],
    });
    assert.deepEqual(
      row.entries.map((e) => e.rung),
      ["lexical", "hop"]
    );
    const viaFusion = rankRow(["invoice-4471"], result, {
      rung: "embedding",
      lexicalMatches: [],
    });
    assert.equal(viaFusion.entries[0]?.rung, "embedding");
  });
});

describe("the bench's rows", () => {
  test("rows without cites are excluded; a multi-turn row contributes its last prompt", () => {
    const rows = benchRows([
      {
        caseId: "query-a",
        prompts: ["What is our EIN?"],
        cites: ["profile.md"],
      },
      { caseId: "query-absent", prompts: ["Workers' comp?"], cites: [] },
      {
        caseId: "query-multi",
        prompts: ["Hi", "And the lease?"],
        cites: [["lease", "articles"]],
      },
    ]);
    assert.deepEqual(rows, [
      { caseId: "query-a", query: "What is our EIN?", cites: ["profile.md"] },
      {
        caseId: "query-multi",
        query: "And the lease?",
        cites: [["lease", "articles"]],
      },
    ]);
  });
});

describe("the pre-registered decision rule", () => {
  test("a knob leaves its default only on a strict MRR improvement", () => {
    const { chosen, combined } = choose({
      base: 0.5,
      reach: 0.5,
      floor: 0.4,
      prior: 0.5,
    });
    assert.deepEqual(chosen, DEFAULTS);
    assert.equal(combined, false);
  });

  test("one improving knob changes alone", () => {
    const { chosen } = choose({
      base: 0.5,
      reach: 0.6,
      floor: 0.5,
      prior: 0.5,
    });
    assert.deepEqual(chosen, {
      ...DEFAULTS,
      reach: { rule: "weighted", floor: 0.2 },
    });
  });

  test("two improving knobs: the combination when it scores at least the best single change", () => {
    const { chosen, combined } = choose(
      { base: 0.5, reach: 0.6, floor: 0.5, prior: 0.7 },
      0.7
    );
    assert.equal(combined, true);
    assert.deepEqual(chosen, {
      ...DEFAULTS,
      reach: { rule: "weighted", floor: 0.2 },
      kindPrior: true,
    });
  });

  test("two improving knobs: the best single change alone when the combination scores below it", () => {
    const { chosen } = choose(
      { base: 0.5, reach: 0.6, floor: 0.5, prior: 0.7 },
      0.65
    );
    assert.deepEqual(chosen, { ...DEFAULTS, kindPrior: true });
  });
});

describe("the bench over a tiny Wiki", () => {
  let root = "";
  let store: WikiStore;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "retrieval-bench-test-"));
    store = createWikiStore({ namespace: "t", env: { WIKI_STORE_DIR: root } });
    const write = (path: string, kind: string, title: string, body: string) =>
      store.write(
        path,
        `---\ntitle: ${title}\nkind: ${kind}\nstatus: active\nflags: []\n---\n\n${body}\n`,
        { etag: null }
      );
    await write("profile.md", "profile", "Profile", "- EIN 88-1234567.");
    await write(
      "entities/cascade.md",
      "entity",
      "Cascade",
      "- Cascade Cascade Cascade parts vendor. Invoices: [4471](../summaries/invoice-4471.md)"
    );
    await write(
      "summaries/invoice-4471.md",
      "summary",
      "Invoice 4471",
      "- Cascade invoice 4471, 212.48 due."
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("one table per knob with MRR and per-row ranks, the chosen configuration and the rule", async () => {
    const rows = [
      { caseId: "query-ein", query: "What is our EIN?", cites: ["profile.md"] },
      {
        caseId: "query-owe-cascade",
        query: "What do we owe Cascade?",
        cites: ["invoice-4471"],
      },
    ];
    const report = await runBench({ store, rows });
    assert.equal(report.hybrid, false);
    const doc = renderBench(report);
    for (const heading of [
      "## Ordering: count rule versus degree-weighted reach",
      "## Match floor: a third of the top score versus 0",
      "## Kind prior on Matches: off versus on",
      "## Chosen configuration",
    ])
      assert.ok(doc.includes(heading), heading);
    assert.match(doc, /lexical-only/i);
    // Each knob table: a header, a divider, a line per row, the MRR line.
    const tables = doc.split("\n## ").filter((s) => s.includes("| Row |"));
    assert.equal(tables.length, 3);
    for (const table of tables) {
      const lines = table.split("\n").filter((l) => l.startsWith("|"));
      assert.equal(lines.length, 2 + rows.length + 1);
      assert.match(lines.at(-1)!, /^\| \*\*MRR\*\* \|/);
    }
    // The entity hub outranks the invoice; the prior puts the invoice first.
    assert.match(doc, /\| query-owe-cascade \| 2 · lexical \| 1 · lexical \|/);
    assert.equal(
      report.knobs.find((k) => k.knob === "prior")!.alternative.mrr,
      1
    );
    assert.deepEqual(report.chosen, { ...DEFAULTS, kindPrior: true });
    assert.match(doc, /strictly improves MRR/);
  });
});
