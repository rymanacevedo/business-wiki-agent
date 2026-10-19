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
