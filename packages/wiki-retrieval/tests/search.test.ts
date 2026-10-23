import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval, type Retrieval } from "../index";
import { fullWiki } from "./full-wiki";

let store: WikiStore;
let retrieval: Retrieval;
let cleanup = () => {};
before(async () => {
  ({ store, cleanup } = await fullWiki());
  retrieval = createRetrieval({ store });
});
after(() => cleanup());

const paths = async (query: string) =>
  (await retrieval.search({ query })).pages.map((p) => p.path);

describe("lexical Matches on fixtures/full", () => {
  // Research #45, section 4.2: the cited Page is in the lexical top 4.
  for (const [query, cited] of [
    ["What is our EIN?", "profile.md"],
    [
      "When does our insurance renew, and who is the insurer?",
      "obligations/2026-11-15-insurance-renewal-meridian-mutual-insurance-company.md",
    ],
    [
      "What do we owe Cascade Appliance Parts?",
      "summaries/2026-09-12-invoice-cascade-parts-4471.md",
    ],
    [
      "How much did we spend on supplies in September 2026?",
      "expenses/supplies.md",
    ],
  ] as const)
    test(`${query} has ${cited} in the top 4`, async () => {
      assert.ok((await paths(query)).slice(0, 4).includes(cited));
    });

  test("the cash purchases are both Matches", async () => {
    const found = await paths("Which purchases did we pay in cash?");
    assert.ok(found.includes("summaries/2026-08-22-receipt-dockside-deli.md"));
    assert.ok(
      found.includes("summaries/2026-09-12-invoice-cascade-parts-4472.md")
    );
  });

  test("Dana Okafor finds the Harborview lease", async () => {
    assert.ok(
      (await paths("Who is Dana Okafor?")).includes(
        "summaries/2025-04-01-lease-harborview.md"
      )
    );
  });

  test("the result is lexical, with no hop and no degrade", async () => {
    const result = await retrieval.search({ query: "What is our EIN?" });
    assert.equal(result.rung, "lexical");
    assert.equal(result.hopRan, false);
    assert.equal(result.degraded, false);
    assert.ok(result.pages.every((p) => p.role === "match"));
  });
});

describe("the result's rules", () => {
  test("at most 5 Matches, fewer with limit", async () => {
    const query = "Harbor Hardware invoice receipt supplies Cascade";
    assert.equal((await retrieval.search({ query })).pages.length, 5);
    assert.equal((await retrieval.search({ query, limit: 2 })).pages.length, 2);
    assert.equal(
      (await retrieval.search({ query, limit: 50 })).pages.length,
      5
    );
  });

  test("index.md, log.md, SCHEMA.md and sources/ are never Matches", async () => {
    const found = await paths(
      "Wiki schema index log Clerk reads this Page vocabulary layout ingest"
    );
    assert.ok(found.length > 0);
    for (const path of found) {
      assert.ok(!["index.md", "log.md", "SCHEMA.md"].includes(path), path);
      assert.ok(!path.startsWith("sources/"), path);
    }
  });

  test("kind filters the Matches", async () => {
    const query = "What do we owe Cascade Appliance Parts?";
    const result = await retrieval.search({ query, kind: "obligation" });
    assert.deepEqual(
      result.pages.map((p) => p.path),
      ["obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md"]
    );
    assert.ok((await paths(query)).some((p) => p.startsWith("entities/")));
  });

  test("every Page carries its title, kind and status", async () => {
    const [page] = (await retrieval.search({ query: "Who is Dana Okafor?" }))
      .pages;
    assert.equal(page.title, "Harborview Properties lease 2025-04-01");
    assert.equal(page.kind, "summary");
    assert.equal(page.status, "active");
  });

  test("an opening-section Match has no heading; a later section names its ##", async () => {
    const result = await retrieval.search({ query: "What is our EIN?" });
    const byPath = new Map(result.pages.map((p) => [p.path, p]));
    assert.equal(
      byPath.get("summaries/2024-10-21-ein-letter.md")?.heading,
      undefined
    );
    assert.equal(byPath.get("profile.md")?.heading, "Identity");
  });

  test("an excerpt is the best fact lines, never the title, sources, kind, status or flags lines", async () => {
    const result = await retrieval.search({
      query: "Which purchases did we pay in cash?",
    });
    const cascade = result.pages.find(
      (p) => p.path === "summaries/2026-09-12-invoice-cascade-parts-4472.md"
    );
    assert.deepEqual(cascade?.excerpt, [
      "vendor: cascade-appliance-parts",
      "- Terms: Will-call; payment recorded as PAID CASH AT WILL-CALL on 2026-09-12. (src: 2026-09-12-invoice-cascade-parts-4472)",
      "- Payment: PAID CASH AT WILL-CALL 09/12/2026. BALANCE DUE 0.00. (src: 2026-09-12-invoice-cascade-parts-4472)",
    ]);
    for (const page of result.pages)
      for (const line of page.excerpt ?? [])
        assert.doesNotMatch(line, /^(title|sources|kind|status|flags): /);
  });

  test("a fact line and its continuation are one excerpt line", async () => {
    const result = await retrieval.search({
      query: "dishwasher drain pump oven igniter",
    });
    const cascade = result.pages.find(
      (p) => p.path === "summaries/2026-09-12-invoice-cascade-parts-4472.md"
    );
    assert.ok(
      cascade?.excerpt?.includes(
        "- Items: - 3 × Oven igniter, hot-surface (univ.) — 32.50 each — 97.50. (src: 2026-09-12-invoice-cascade-parts-4472) - 2 × Dishwasher drain pump — 49.62 each — 99.24. (src: 2026-09-12-invoice-cascade-parts-4472)"
      ),
      JSON.stringify(cascade?.excerpt)
    );
  });

  test("a Query with no indexed token has no Matches", async () => {
    assert.deepEqual(
      (await retrieval.search({ query: "what is the?" })).pages,
      []
    );
    assert.deepEqual((await retrieval.search({ query: "zzzqqq" })).pages, []);
  });
});

describe("the kind prior on Matches (the bench's option)", () => {
  const QUERY = "What do we owe Cascade Appliance Parts?";
  const CASCADE = "entities/cascade-appliance-parts.md";
  const PRIOR = ["profile", "obligation", "summary", "entity", "ledger"];

  test("off by default: the vendor's entity hub outranks its invoice and Obligation", async () => {
    const [first] = (await retrieval.search({ query: QUERY })).pages;
    assert.equal(first?.path, CASCADE);
  });

  test("on: the same Matches, by kind (profile, obligation, summary, entity, ledger), then fused rank", async () => {
    const off = (await retrieval.search({ query: QUERY })).pages;
    const on = (
      await createRetrieval({ store, kindPrior: true }).search({ query: QUERY })
    ).pages;
    assert.deepEqual(
      on.map((p) => p.path).sort(),
      off.map((p) => p.path).sort()
    );
    const expected = [...off].sort(
      (a, b) =>
        PRIOR.indexOf(a.kind) - PRIOR.indexOf(b.kind) ||
        off.indexOf(a) - off.indexOf(b)
    );
    assert.deepEqual(
      on.map((p) => p.path),
      expected.map((p) => p.path)
    );
    assert.notEqual(on[0]?.path, CASCADE);
  });
});
