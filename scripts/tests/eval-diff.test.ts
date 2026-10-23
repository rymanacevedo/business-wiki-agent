import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const SCRIPT = resolve(__dirname, "../eval-diff.ts");

const slice = (label: string, verdict: string) => ({
  label,
  slice: "ingest",
  cases: [
    {
      id: "ingest/sources/0000",
      caseId: "ingest-a",
      description: null,
      class: "normal",
      tags: ["normal"],
      verdict,
      gates: [{ name: "satisfies [page]", passed: verdict === "passed" }],
      scores: { extraction: verdict === "passed" ? 1 : 0.5 },
      toolCalls: 4,
      costUsd: 0.01,
      traceIds: [],
      resultsJsonl: null,
    },
  ],
});

async function repo(readme?: string) {
  const root = await mkdtemp(join(tmpdir(), "eval-diff-"));
  for (const [label, verdict] of [
    ["before", "failed"],
    ["after", "passed"],
  ]) {
    await mkdir(join(root, "docs/evals/runs", label), { recursive: true });
    await writeFile(
      join(root, "docs/evals/runs", label, "ingest.json"),
      JSON.stringify(slice(label, verdict))
    );
  }
  if (readme !== undefined) await writeFile(join(root, "README.md"), readme);
  return root;
}

const run = (root: string, ...args: string[]) =>
  spawnSync("bun", [SCRIPT, ...args, "--root", root], { encoding: "utf8" });

test("the diff script writes before-after.md and rewrites the README block", async () => {
  const root = await repo(
    "# Clerk\n\n<!-- eval-diff:start -->\n<!-- eval-diff:end -->\n"
  );
  const result = run(root, "before", "after");

  assert.equal(result.status, 0, result.stderr);
  const page = await readFile(join(root, "docs/evals/before-after.md"), "utf8");
  assert.ok(
    page.includes("| ingest/sources/0000 | satisfies [page] | none |"),
    page
  );
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.ok(
    readme.includes(
      "| ingest | 1 | 0/1 (0%) | 1/1 (100%) | 4.0 → 4.0 | $0.0100 → $0.0100 |"
    ),
    readme
  );
  assert.ok(readme.includes("| **total** | 1 |"), readme);
});

test("a README without the markers fails, and an unknown run label fails", async () => {
  const root = await repo("# Clerk\n");

  assert.equal(run(root, "before", "after").status, 1);
  assert.equal(run(root, "before", "nope").status, 1);
  assert.equal(run(root, "before").status, 64);
});

test("--block writes the named block and leaves the default block untouched", async () => {
  const readme =
    "# Clerk\n\n<!-- eval-diff:start -->\nslice table\n<!-- eval-diff:end -->\n\n<!-- eval-diff:retrieval:start -->\n<!-- eval-diff:retrieval:end -->\n";
  const root = await repo(readme);
  const result = run(root, "before", "after", "--block", "retrieval");

  assert.equal(result.status, 0, result.stderr);
  const written = await readFile(join(root, "README.md"), "utf8");
  assert.ok(
    written.includes(
      "<!-- eval-diff:start -->\nslice table\n<!-- eval-diff:end -->"
    ),
    written
  );
  assert.ok(
    written.includes("<!-- eval-diff:retrieval:start -->\n| Slice | Cases |"),
    written
  );
  assert.ok(written.includes("| **total** | 1 |"), written);
});

test("--block writes its own before/after page and leaves the default page alone", async () => {
  const root = await repo(
    "# Clerk\n\n<!-- eval-diff:start -->\n<!-- eval-diff:end -->\n\n<!-- eval-diff:retrieval:start -->\n<!-- eval-diff:retrieval:end -->\n"
  );
  await mkdir(join(root, "docs/evals"), { recursive: true });
  await writeFile(
    join(root, "docs/evals/before-after.md"),
    "the spec #15 record\n"
  );
  const result = run(root, "before", "after", "--block", "retrieval");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(join(root, "docs/evals/before-after.md"), "utf8"),
    "the spec #15 record\n"
  );
  const page = await readFile(
    join(root, "docs/evals/before-after.retrieval.md"),
    "utf8"
  );
  assert.ok(
    page.includes("| ingest/sources/0000 | satisfies [page] | none |"),
    page
  );
  assert.match(result.stdout, /before-after\.retrieval\.md/);
});

test("--block with no such marker pair fails and names the pair", async () => {
  const root = await repo(
    "# Clerk\n\n<!-- eval-diff:start -->\n<!-- eval-diff:end -->\n"
  );
  const result = run(root, "before", "after", "--block", "retrieval");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /eval-diff:retrieval:start/);
});

test("a named block reads its own dataset fixes, not the default block's", async () => {
  const root = await repo(
    "# Clerk\n\n<!-- eval-diff:start -->\n<!-- eval-diff:end -->\n\n<!-- eval-diff:retrieval:start -->\n<!-- eval-diff:retrieval:end -->\n"
  );
  await writeFile(
    join(root, "docs/evals/dataset-fixes.json"),
    JSON.stringify([
      { id: "ingest/sources/0000", commit: "abc1234", change: "old fix" },
    ])
  );

  assert.equal(run(root, "before", "after", "--block", "retrieval").status, 0);
  const retrieval = await readFile(join(root, "README.md"), "utf8");
  assert.ok(!retrieval.includes("dataset fixes"), retrieval);

  await writeFile(
    join(root, "docs/evals/dataset-fixes.retrieval.json"),
    JSON.stringify([
      { id: "ingest/sources/0000", commit: "def5678", change: "new fix" },
    ])
  );
  assert.equal(run(root, "before", "after", "--block", "retrieval").status, 0);
  const page = await readFile(
    join(root, "docs/evals/before-after.retrieval.md"),
    "utf8"
  );
  assert.ok(page.includes("| def5678 | new fix |"), page);
  assert.ok(!page.includes("old fix"), page);
});

test("a block name that is not a plain slug is a usage error", async () => {
  const root = await repo("# Clerk\n");

  for (const name of ["", "../x", "a b", "retrieval:start"])
    assert.equal(run(root, "before", "after", "--block", name).status, 64);
});
