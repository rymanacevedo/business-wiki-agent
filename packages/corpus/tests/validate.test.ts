import assert from "node:assert/strict";
import { test } from "node:test";
import { validateManifest, type Manifest } from "../index";
import { at, filesOf, validManifest } from "./fixture";

function problemsOf(m: Manifest, files = filesOf(m)): string[] {
  return validateManifest(m, files);
}

function assertProblem(problems: string[], fragment: string): void {
  assert.ok(
    problems.some((p) => p.includes(fragment)),
    `expected a problem containing "${fragment}", got:\n${problems.join("\n")}`
  );
}

test("a consistent Manifest has no problems", () => {
  assert.deepEqual(problemsOf(validManifest()), []);
});

test("duplicate source ids are reported", () => {
  const m = validManifest();
  m.sources.push({ ...at(m, "2026-08-01-receipt-a") });
  assertProblem(problemsOf(m), "duplicate id 2026-08-01-receipt-a");
});

test("a Source file without an entry, and an entry without a file, are both reported", () => {
  const m = validManifest();
  const files = filesOf(m).filter((f) => f !== "2026-08-01-receipt-a.txt");
  files.push("2026-09-01-stray.md");
  const problems = problemsOf(m, files);
  assertProblem(problems, "no file for 2026-08-01-receipt-a");
  assertProblem(problems, "no entry for 2026-09-01-stray.md");
});

test("an entry's file must be its id with a .md or .txt extension", () => {
  const m = validManifest();
  at(m, "2026-08-01-receipt-a").file = "2026-08-01-receipt-z.txt";
  assertProblem(
    problemsOf(m),
    "file 2026-08-01-receipt-z.txt does not match id 2026-08-01-receipt-a"
  );
});

test("ids follow YYYY-MM-DD-<slug> dated by the document's own date", () => {
  const m = validManifest();
  const a = at(m, "2026-08-01-receipt-a");
  a.id = "2026-8-01-Receipt_A";
  a.file = `${a.id}.txt`;
  at(m, "2026-08-02-receipt-b").date = "2026-08-03";
  const problems = problemsOf(m);
  assertProblem(problems, "bad id 2026-8-01-Receipt_A");
  assertProblem(problems, "id 2026-08-02-receipt-b is not dated 2026-08-03");
});

test("dates must be real calendar dates", () => {
  const m = validManifest();
  const j = at(m, "2026-08-10-invoice-j");
  j.payment = { status: "unknown", due: "2026-02-30" };
  j.obligations = [{ kind: "other", due: "2026-13-01", counterparty: null }];
  const problems = problemsOf(m);
  assertProblem(problems, "2026-08-10-invoice-j: bad date 2026-02-30");
  assertProblem(problems, "2026-08-10-invoice-j: bad date 2026-13-01");
});

test("Allocations must sum to the amount, to the cent", () => {
  const m = validManifest();
  at(m, "2026-08-05-receipt-e").allocations = [
    { category: "supplies", amount: 4.33 },
    { category: "equipment", amount: 5.66 },
  ];
  assertProblem(
    problemsOf(m),
    "2026-08-05-receipt-e: allocations sum to 9.99, amount is 10"
  );
});

test("an expense entry has Allocations and a payment block; a non-expense has neither", () => {
  const m = validManifest();
  at(m, "2026-08-01-receipt-a").allocations = [];
  at(m, "2026-08-31-statement-bank").payment = { status: "paid", due: null };
  const problems = problemsOf(m);
  assertProblem(problems, "2026-08-01-receipt-a: amount without allocations");
  assertProblem(problems, "2026-08-31-statement-bank: payment without amount");
});

test("each Trap is present exactly once", () => {
  const m = validManifest();
  at(m, "2026-08-01-receipt-a").trap = "contradiction";
  at(m, "2026-08-09-receipt-i").trap = null;
  const problems = problemsOf(m);
  assertProblem(problems, "trap contradiction appears 2 times");
  assertProblem(problems, "trap past-deadline appears 0 times");
});

test("the Inbox is exactly the Supersession Trap, the PAID duplicate, and one plain receipt", () => {
  const m = validManifest();
  at(m, "2026-08-02-receipt-b").inbox = false;
  assertProblem(problemsOf(m), "inbox has 2 sources, expected 3");

  const swapped = validManifest();
  at(swapped, "2026-08-02-receipt-b").inbox = false;
  at(swapped, "2026-08-07-receipt-g").inbox = true;
  assertProblem(problemsOf(swapped), "inbox needs one plain receipt");
});

test("kinds, categories, Obligation kinds, Traps, and payment statuses come from the closed lists", () => {
  const m = validManifest();
  const a = at(m, "2026-08-01-receipt-a");
  Object.assign(a, {
    kind: "napkin",
    allocations: [{ category: "snacks", amount: 10 }],
    payment: { status: "maybe", due: null },
    obligations: [{ kind: "birthday", due: "2026-09-01", counterparty: null }],
  });
  Object.assign(at(m, "2026-08-02-receipt-b"), { trap: "gremlin" });
  const problems = problemsOf(m);
  assertProblem(problems, "2026-08-01-receipt-a: unknown kind napkin");
  assertProblem(problems, "2026-08-01-receipt-a: unknown category snacks");
  assertProblem(problems, "2026-08-01-receipt-a: unknown payment status maybe");
  assertProblem(
    problems,
    "2026-08-01-receipt-a: unknown obligation kind birthday"
  );
  assertProblem(problems, "2026-08-02-receipt-b: unknown trap gremlin");
});

test("duplicates and corroborations point at Sources in the Manifest", () => {
  const m = validManifest();
  at(m, "2026-08-05-receipt-e-2").duplicateOf = "2026-01-01-nowhere";
  at(m, "2026-08-31-statement-bank").corroborates = ["2026-01-02-nowhere"];
  const problems = problemsOf(m);
  assertProblem(
    problems,
    "2026-08-05-receipt-e-2: duplicateOf unknown source 2026-01-01-nowhere"
  );
  assertProblem(
    problems,
    "2026-08-31-statement-bank: corroborates unknown source 2026-01-02-nowhere"
  );
});

test("a bank statement corroborates only Records already paid, from its own month", () => {
  const m = validManifest();
  at(m, "2026-08-31-statement-bank").corroborates = [
    "2026-08-10-invoice-j",
    "2026-08-01-receipt-a",
  ];
  at(m, "2026-08-01-receipt-a").date = "2026-07-31";
  at(m, "2026-08-01-receipt-a").id = "2026-07-31-receipt-a";
  at(m, "2026-08-31-statement-bank").corroborates[1] = "2026-07-31-receipt-a";
  const problems = problemsOf(m);
  assertProblem(
    problems,
    "2026-08-31-statement-bank: corroborates 2026-08-10-invoice-j, which is not paid"
  );
  assertProblem(
    problems,
    "2026-08-31-statement-bank: corroborates 2026-07-31-receipt-a from another month"
  );
});
