import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import {
  createRetrieval,
  renderResult,
  type MatchKind,
  type ResultPage,
  type Retrieval,
  type RetrievalResult,
} from "../index";
import { fullWiki } from "./full-wiki";

let store: WikiStore;
let retrieval: Retrieval;
let cleanup = () => {};
before(async () => {
  ({ store, cleanup } = await fullWiki());
  retrieval = createRetrieval({ store });
});
after(() => cleanup());

const AUGUST = "summaries/2026-08-31-bank-statement-tidewater.md";
const HARBOR = "summaries/2026-08-03-receipt-harbor-hardware.md";
const INVOICE_4471 = "summaries/2026-09-12-invoice-cascade-parts-4471.md";
const PAY_4471 =
  "obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md";
const CASCADE = "entities/cascade-appliance-parts.md";
const SCAFFOLDING = /^(index\.md|log\.md|SCHEMA\.md|sources\/)/;

const hop = (query: string, extra: { kind?: MatchKind; limit?: number } = {}) =>
  retrieval.search({ query, neighbourhood: true, ...extra });
const role = (r: RetrievalResult, role: ResultPage["role"]) =>
  r.pages.filter((p) => p.role === role);
const find = (r: RetrievalResult, path: string) =>
  r.pages.find((p) => p.path === path);
/** The labels on the Link from `match` to `neighbour` in the result. */
const labels = (r: RetrievalResult, neighbour: string, match: string) => {
  const page = find(r, neighbour);
  assert.equal(page?.role, "neighbour", `${neighbour} is a neighbour`);
  return page?.via?.find((v) => v.match === match)?.labels;
};

describe("the Neighbourhood rows, hop on", () => {
  for (const query of [
    "Is there bank evidence that the Ridgeline order was paid?",
    "Which purchases did the August bank statement confirm?",
  ])
    test(`${query} has the August statement as a Match or neighbour`, async () => {
      const result = await hop(query);
      assert.equal(result.hopRan, true);
      assert.ok(find(result, AUGUST));
      assert.ok(role(result, "neighbour").length > 0);
    });
});

describe("known Links, both directions", () => {
  // One Match per Query (limit 1, a kind), so the neighbour list is that Match's Links.
  test("an Obligation and the Record it pays: cites and links, both ways", async () => {
    const fromObligation = await hop("pay invoice Cascade 4471", {
      kind: "obligation",
      limit: 1,
    });
    assert.equal(fromObligation.pages[0].path, PAY_4471);
    assert.deepEqual(labels(fromObligation, INVOICE_4471, PAY_4471), [
      "cited by",
      "linked from",
    ]);
    const fromRecord = await hop("Cascade Appliance Parts invoice 4471", {
      kind: "summary",
      limit: 1,
    });
    assert.equal(fromRecord.pages[0].path, INVOICE_4471);
    assert.deepEqual(labels(fromRecord, PAY_4471, INVOICE_4471), [
      "cites",
      "links to",
    ]);
  });

  test("an Obligation and its counterparty entity: party of, names party", async () => {
    const fromObligation = await hop("pay invoice Cascade 4471", {
      kind: "obligation",
      limit: 1,
    });
    assert.deepEqual(labels(fromObligation, CASCADE, PAY_4471), ["party of"]);
    const fromEntity = await hop("Cascade Appliance Parts", {
      kind: "entity",
      limit: 1,
    });
    assert.equal(fromEntity.pages[0].path, CASCADE);
    assert.deepEqual(labels(fromEntity, PAY_4471, CASCADE), ["names party"]);
    // The Record's vendor, its Records list link and its sources collapse to one Link.
    assert.deepEqual(labels(fromEntity, INVOICE_4471, CASCADE), [
      "cited by",
      "linked from",
      "names party",
    ]);
  });

  test("the Harbor Hardware receipt's Also seen in: the statement is cited by it, and it cites the statement", async () => {
    const fromReceipt = await hop("Harbor Hardware wire nuts zip ties", {
      kind: "summary",
      limit: 1,
    });
    assert.equal(fromReceipt.pages[0].path, HARBOR);
    assert.deepEqual(labels(fromReceipt, AUGUST, HARBOR), ["cited by"]);
    const fromStatement = await hop("Tidewater statement 2026-08-31 August", {
      kind: "summary",
      limit: 1,
    });
    assert.equal(fromStatement.pages[0].path, AUGUST);
    assert.deepEqual(labels(fromStatement, HARBOR, AUGUST), ["cites"]);
  });
});

describe("the result's ordering and caps, hop on", () => {
  const QUERY = "Which purchases did the August bank statement confirm?";

  test("Matches first in their order, then neighbours; at most 8 Pages", async () => {
    const off = await retrieval.search({ query: QUERY });
    const on = await hop(QUERY);
    assert.deepEqual(
      role(on, "match").map((p) => p.path),
      off.pages.map((p) => p.path)
    );
    const roles = on.pages.map((p) => p.role);
    assert.equal(roles.indexOf("neighbour"), role(on, "match").length);
    assert.equal(on.pages.length, 8);
  });

  test("a Page reached by more Matches ranks first, and via lists them in Match order", async () => {
    const on = await hop(QUERY);
    const matchOrder = role(on, "match").map((p) => p.path);
    const [first, ...rest] = role(on, "neighbour");
    assert.ok(first.via!.length > Math.max(...rest.map((p) => p.via!.length)));
    // Reach outranks the best reaching Match: two Matches from rank 1 beat one from rank 0.
    const formed = await hop(
      "What kind of business entity are we, and when was it formed?"
    );
    const formedOrder = role(formed, "match").map((p) => p.path);
    const [top, next] = role(formed, "neighbour");
    assert.equal(top.via!.length, 2);
    assert.equal(formedOrder.indexOf(top.via![0].match), 1);
    assert.equal(next.via!.length, 1);
    assert.equal(formedOrder.indexOf(next.via![0].match), 0);
    for (const p of role(on, "neighbour")) {
      const at = p.via!.map((v) => matchOrder.indexOf(v.match));
      assert.ok(at.every((i) => i >= 0));
      assert.deepEqual(
        at,
        [...at].sort((a, b) => a - b)
      );
    }
  });

  test("ties go to the best reaching Match, then the kind prior, then path", async () => {
    // One Match, so every neighbour ties on reach and on the reaching Match.
    const on = await hop("Tidewater statement 2026-08-31 August", {
      kind: "summary",
      limit: 1,
    });
    assert.deepEqual(
      role(on, "neighbour").map((p) => p.path),
      [
        "profile.md",
        HARBOR,
        "summaries/2026-08-11-receipt-portside-fuel.md",
        "summaries/2026-08-14-receipt-paper-trail-office.md",
        "summaries/2026-08-20-invoice-ridgeline-tools-r20931.md",
        "entities/tidewater-community-bank.md",
      ]
    );
    // Several Matches: equal reach orders by the best reaching Match's rank.
    const several = await hop(QUERY);
    const order = role(several, "match").map((p) => p.path);
    const near = role(several, "neighbour");
    for (let i = 1; i < near.length; i++)
      if (near[i].via!.length === near[i - 1].via!.length)
        assert.ok(
          order.indexOf(near[i - 1].via![0].match) <=
            order.indexOf(near[i].via![0].match)
        );
  });

  test("a Page that is both a Match and a neighbour stays a Match, with no via", async () => {
    // The Ridgeline Record cites the August statement; both are Matches here.
    const on = await hop(
      "Is there bank evidence that the Ridgeline order was paid?"
    );
    assert.equal(find(on, AUGUST)?.role, "match");
    assert.equal(find(on, AUGUST)?.via, undefined);
    assert.equal(new Set(on.pages.map((p) => p.path)).size, on.pages.length);
  });

  test("the cap fills neighbours only after all Matches", async () => {
    const on = await hop("Tidewater statement 2026-08-31 August", { limit: 1 });
    assert.equal(role(on, "match").length, 1);
    assert.ok(on.pages.length <= 8);
    const five = await hop(QUERY);
    assert.equal(role(five, "match").length, 5);
    assert.equal(role(five, "neighbour").length, 3);
  });

  test("kind filters Matches only; neighbours may be any kind", async () => {
    const on = await hop("pay invoice Cascade 4471", { kind: "obligation" });
    assert.ok(role(on, "match").every((p) => p.kind === "obligation"));
    assert.ok(role(on, "neighbour").some((p) => p.kind !== "obligation"));
  });

  test("scaffolding and Sources are never neighbours", async () => {
    for (const query of [
      QUERY,
      "Harborview lease landlord",
      "Clerk wiki log",
    ]) {
      const on = await hop(query);
      assert.ok(!on.pages.some((p) => SCAFFOLDING.test(p.path)), query);
    }
  });

  test("zero Matches means no neighbours, though the hop ran", async () => {
    const on = await hop("xylophone zeppelin");
    assert.deepEqual(on.pages, []);
    assert.equal(on.hopRan, true);
  });

  test("neighbours carry no excerpt or heading", async () => {
    for (const p of role(await hop(QUERY), "neighbour")) {
      assert.equal(p.excerpt, undefined);
      assert.equal(p.heading, undefined);
    }
  });
});

describe("the switch", () => {
  test("off by default: the same Matches as before, no neighbours, hopRan false", async () => {
    const query = "Which purchases did the August bank statement confirm?";
    const plain = await retrieval.search({ query });
    const off = await retrieval.search({ query, neighbourhood: false });
    assert.equal(plain.hopRan, false);
    assert.equal(off.hopRan, false);
    assert.deepEqual(role(plain, "neighbour"), []);
    assert.deepEqual(off, plain);
    assert.equal(plain.pages.length, 5);
  });
});

describe("degree-weighted reach, for the bench", () => {
  test("a hub Match's reach counts less, and the floor drops weak neighbours", async () => {
    const weighted = createRetrieval({
      store,
      reach: { rule: "weighted", floor: 0 },
    });
    const query = "Which purchases did the August bank statement confirm?";
    const count = await hop(query);
    const result = await weighted.search({ query, neighbourhood: true });
    assert.deepEqual(
      role(result, "match").map((p) => p.path),
      role(count, "match").map((p) => p.path)
    );
    const scores = role(result, "neighbour").map((p) => p.score);
    assert.ok(scores.every((s) => s > 0 && s < 1));
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => b - a)
    );
    const floored = createRetrieval({
      store,
      reach: { rule: "weighted", floor: 1 },
    });
    assert.deepEqual(
      role(await floored.search({ query, neighbourhood: true }), "neighbour"),
      []
    );
  });
});

describe("rendered with the hop on", () => {
  test("the Harbor Hardware receipt and its Also linked tier", async () => {
    const result = await hop("Harbor Hardware wire nuts zip ties", {
      kind: "summary",
      limit: 1,
    });
    assert.equal(
      renderResult(result).split("## Also linked")[1],
      ` (3)
- summaries/2026-08-31-bank-statement-tidewater.md · summary · active: cited by ${HARBOR}
- entities/harbor-hardware-supply.md · entity · active: cites, links to, party of ${HARBOR}
- expenses/supplies.md · ledger · active: cites, links to ${HARBOR}`
    );
  });
});
