import assert from "node:assert/strict";
import { test } from "node:test";
import { renderResult, type ResultPage, type RetrievalResult } from "../index";

const result = (pages: ResultPage[], extra: Partial<RetrievalResult> = {}) =>
  ({
    rung: "lexical",
    degraded: false,
    hopRan: false,
    pages,
    ...extra,
  }) as RetrievalResult;

const LEASE: ResultPage = {
  path: "summaries/2025-04-01-lease-harborview.md",
  title: "Harborview Properties lease 2025-04-01",
  kind: "summary",
  status: "active",
  role: "match",
  excerpt: [
    "- **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)",
    "/s/ Dana Okafor, Manager, Harborview Properties LLC (src: 2025-04-01-lease-harborview)",
  ],
  score: 5.9,
};
const PROFILE: ResultPage = {
  path: "profile.md",
  title: "Northwind Repair LLC",
  kind: "profile",
  status: "superseded",
  role: "match",
  heading: "Premises lease",
  excerpt: [
    "- **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)",
  ],
  score: 4.2,
};

test("Variant A: Matches with their line and blockquoted excerpt; no Also linked when there are no neighbours", () => {
  assert.equal(
    renderResult(result([LEASE, PROFILE])),
    `## Matches (2)
### summaries/2025-04-01-lease-harborview.md
Harborview Properties lease 2025-04-01 · summary · active
> - **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)
> /s/ Dana Okafor, Manager, Harborview Properties LLC (src: 2025-04-01-lease-harborview)
### profile.md
Northwind Repair LLC · profile · superseded · section "Premises lease"
> - **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)`
  );
});

test("Variant A: neighbours under Also linked, every reaching Match listed", () => {
  const neighbour: ResultPage = {
    path: "entities/harborview-properties.md",
    title: "Harborview Properties LLC",
    kind: "entity",
    status: "active",
    role: "neighbour",
    via: [
      { match: LEASE.path, labels: ["party of"] },
      { match: PROFILE.path, labels: ["cited by", "linked from"] },
    ],
    score: 2,
  };
  assert.equal(
    renderResult(result([LEASE, neighbour], { hopRan: true })),
    `## Matches (1)
### summaries/2025-04-01-lease-harborview.md
Harborview Properties lease 2025-04-01 · summary · active
> - **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)
> /s/ Dana Okafor, Manager, Harborview Properties LLC (src: 2025-04-01-lease-harborview)
## Also linked (1)
- entities/harborview-properties.md · entity · active: party of summaries/2025-04-01-lease-harborview.md; cited by, linked from profile.md`
  );
});

test("zero Matches renders one sentence, with or without the hop", () => {
  assert.equal(renderResult(result([])), "No Page matches the query.");
  assert.equal(
    renderResult(result([], { hopRan: true })),
    "No Page matches the query."
  );
});

test("a degraded result adds exactly one trailing line", () => {
  assert.equal(
    renderResult(result([PROFILE], { degraded: true })),
    `## Matches (1)
### profile.md
Northwind Repair LLC · profile · superseded · section "Premises lease"
> - **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)
Keyword matches only this time: semantic matching was unavailable.`
  );
  assert.equal(
    renderResult(result([], { degraded: true })),
    "No Page matches the query.\nKeyword matches only this time: semantic matching was unavailable."
  );
});

test("no score or Rung reaches the text", () => {
  const text = renderResult(result([LEASE, PROFILE], { rung: "embedding" }));
  assert.doesNotMatch(text, /5\.9|4\.2|lexical|embedding|rung/i);
});

test("hop on but no neighbours, and hop off: no Also linked section and no sentence about it", () => {
  const expected = `## Matches (1)
### profile.md
Northwind Repair LLC · profile · superseded · section "Premises lease"
> - **Landlord**: Harborview Properties LLC (src: 2025-04-01-lease-harborview)`;
  assert.equal(renderResult(result([PROFILE], { hopRan: true })), expected);
  assert.equal(renderResult(result([PROFILE], { hopRan: false })), expected);
});
