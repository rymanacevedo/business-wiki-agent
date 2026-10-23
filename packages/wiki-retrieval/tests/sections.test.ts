import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";
import { sectionise, tokenise } from "../lexical";

const FULL = resolve(import.meta.dirname, "../../../fixtures/full");
const SCAFFOLDING = new Set(["index.md", "log.md", "SCHEMA.md"]);

function pages(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((name) => relative(dir, join(dir, name)))
    .filter((path) => path.endsWith(".md") && !SCAFFOLDING.has(path))
    .sort();
}

// The research counted 108 sections with a sectioniser that had no 300-token
// split (its maximum was the bank statement's 360-token Transactions
// section). The split the spec adds fires on exactly that section, so the
// fixture is 108 heading-bounded sections, one of them in two parts: 109.
test("fixtures/full has 70 Pages and 108 sections, one split in two", () => {
  const paths = pages(FULL);
  assert.equal(paths.length, 70);
  const sections = paths.flatMap((path) =>
    sectionise(path, readFileSync(join(FULL, path), "utf8"))
  );
  assert.equal(sections.length, 109);
  const split = sections.filter(
    (s, i) =>
      i > 0 &&
      s.heading !== undefined &&
      s.heading === sections[i - 1].heading &&
      s.path === sections[i - 1].path
  );
  assert.deepEqual(
    split.map((s) => s.id),
    [
      "summaries/2026-09-30-bank-statement-tidewater.md#transactions-as-stated-on-the-statement-1",
    ]
  );
  assert.ok(sections.every((s) => tokenise(s.text).length <= 300));
});

const PAGE = `---
title: Acme Supply receipt 2026-09-01
kind: summary
sources: [2026-09-01-receipt-acme]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
expense:
  vendor: acme-supply
  amount: 12.50
  document: null
  allocations:
    - { category: supplies, amount: 12.50 }
  payment:
    status: paid
    due: null
    evidence: [2026-09-01-receipt-acme]
---

# Acme receipt

ACME SUPPLY (src: 2026-09-01-receipt-acme)

- **Items**:
  - 2 × widget — 6.25 each (src: 2026-09-01-receipt-acme)
- **Total**: 12.50 (src: 2026-09-01-receipt-acme)

## Also seen in

- [bank statement](2026-09-30-bank.md)

## Notes

## Also seen in

- second list
`;

test("section 0 folds the frontmatter facts; every ## opens a section; empty ones drop", () => {
  const sections = sectionise("summaries/2026-09-01-receipt-acme.md", PAGE);
  assert.deepEqual(
    sections.map((s) => [s.id, s.heading]),
    [
      ["summaries/2026-09-01-receipt-acme.md#top-0", undefined],
      ["summaries/2026-09-01-receipt-acme.md#also-seen-in-0", "Also seen in"],
      ["summaries/2026-09-01-receipt-acme.md#also-seen-in-1", "Also seen in"],
    ]
  );
  assert.deepEqual(sections[0].lines, [
    "title: Acme Supply receipt 2026-09-01",
    "kind: summary",
    "sources: [2026-09-01-receipt-acme]",
    "status: active",
    "vendor: acme-supply",
    "amount: 12.50",
    "payment.status: paid",
    "payment.evidence: [2026-09-01-receipt-acme]",
    "ACME SUPPLY (src: 2026-09-01-receipt-acme)",
    "- **Items**: - 2 × widget — 6.25 each (src: 2026-09-01-receipt-acme)",
    "- **Total**: 12.50 (src: 2026-09-01-receipt-acme)",
  ]);
});

test("the title and heading repeat into each section's indexed text", () => {
  const [, also] = sectionise("summaries/2026-09-01-receipt-acme.md", PAGE);
  const tokens = tokenise(also.text);
  assert.ok(tokens.includes("acme"), "title token");
  assert.ok(tokens.includes("seen"), "heading token");
  assert.ok(tokens.includes("statement"), "body token");
});

test("a section's id survives an edit elsewhere on the Page", () => {
  const before = sectionise("p.md", PAGE).map((s) => s.id);
  const edited = PAGE.replace("ACME SUPPLY", "## Header\n\nACME SUPPLY");
  const after = sectionise("p.md", edited).map((s) => s.id);
  assert.ok(after.includes(before[1]) && after.includes(before[2]));
});

test("a section over 300 tokens splits at the fact line nearest its midpoint, never inside one", () => {
  const fact = (i: number) =>
    `- **Row ${i}**: alpha beta gamma delta epsilon zeta eta theta iota kappa\n  - continued ${i}`;
  const page = `---\ntitle: Long\nkind: ledger\n---\n\n## Rows\n\n${Array.from({ length: 30 }, (_, i) => fact(i + 10)).join("\n")}\n`;
  const [, first, second] = sectionise("expenses/long.md", page);
  assert.equal(first.heading, "Rows");
  assert.equal(second.heading, "Rows");
  assert.equal(first.lines.length, 15);
  assert.equal(second.lines.length, 15);
  assert.match(second.lines[0], /^- \*\*Row 25\*\*: .* - continued 25$/);
  assert.ok(tokenise(second.text).includes("long"), "title repeated");
  assert.ok(tokenise(second.text).includes("rows"), "heading repeated");
});

test("block-style frontmatter lists are indexed like flow ones", () => {
  const page = `---\ntitle: Block\nkind: summary\nsources:\n  - 2026-01-02-zquorblat-letter\n  # a comment\nflags:\n  - needs-owner\nexpense:\n  allocations:\n    - { category: meals, amount: 1.00 }\n  payment:\n    evidence:\n      - 2026-01-03-bank\n---\n\nBody line\n`;
  const [top] = sectionise("summaries/block.md", page);
  assert.deepEqual(top.lines, [
    "title: Block",
    "kind: summary",
    "sources: [2026-01-02-zquorblat-letter]",
    "flags: [needs-owner]",
    "payment.evidence: [2026-01-03-bank]",
    "Body line",
  ]);
  assert.ok(tokenise(top.text).includes("2026-01-02-zquorblat-letter"));
  assert.ok(tokenise(top.text).includes("needs-owner"));
});

test("a comment on a block list's key does not hide its items", () => {
  const page = `---\ntitle: Commented\nkind: entity\nsources: # provenance\n  - 2026-01-02-zquorblat-letter\nflags: # set by Lint\n  - needs-owner\n---\n\nBody\n`;
  const [top] = sectionise("entities/commented.md", page);
  assert.ok(top.lines.includes("sources: [2026-01-02-zquorblat-letter]"));
  assert.ok(top.lines.includes("flags: [needs-owner]"));
});
