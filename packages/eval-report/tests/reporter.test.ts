import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { EveEvalRunSummary } from "eve/evals";
import { sliceReporter, type SliceReport } from "../index";
import { completed, gate, score } from "./fixtures";

async function dirs() {
  const root = await mkdtemp(join(tmpdir(), "eval-report-"));
  return {
    outDir: join(root, "docs/evals/runs"),
    artifactsDir: join(root, ".eve/evals"),
    root,
  };
}

const read = async (file: string) =>
  JSON.parse(await readFile(file, "utf8")) as SliceReport;
const summary = {} as EveEvalRunSummary;
const target = {
  kind: "local",
  url: "http://localhost",
  capabilities: { devRoutes: true },
} as const;

test("each completed eval lands in its slice's JSON under the run label", async () => {
  const { outDir, artifactsDir } = await dirs();
  const reporter = sliceReporter({ label: "before", outDir, artifactsDir });
  await reporter.onRunStart([], target);

  await reporter.onEvalComplete(
    ...completed({
      id: "ingest/sources/0000",
      caseId: "ingest-receipt-harbor-hardware",
      tags: ["normal", "trajectory"],
      verdict: "failed",
      assertions: [
        gate("succeeded", true),
        gate("satisfies [page]", false, "no summary Page"),
        score("extraction", 0.75, 0.8),
        score("page_faithful", 0.9, 0.7),
        { name: "judge.boolean", severity: "soft", score: 0.4, errored: false },
      ],
      toolCalls: 11,
      costUsd: 0.0123,
    })
  );

  const report = await read(join(outDir, "before/ingest.json"));
  assert.equal(report.label, "before");
  assert.equal(report.slice, "ingest");
  assert.deepEqual(report.cases, [
    {
      id: "ingest/sources/0000",
      caseId: "ingest-receipt-harbor-hardware",
      description: "Case ingest-receipt-harbor-hardware",
      class: "normal",
      tags: ["normal", "trajectory"],
      verdict: "failed",
      gates: [
        { name: "succeeded", passed: true },
        { name: "satisfies [page]", passed: false, message: "no summary Page" },
      ],
      scores: { extraction: 0.75, page_faithful: 0.9 },
      toolCalls: 11,
      costUsd: 0.0123,
      traceIds: ["trace-ingest-receipt-harbor-hardware"],
      resultsJsonl: null,
    },
  ]);
});

test("safety sub-directories report as one safety slice, and a second invocation merges by id", async () => {
  const { outDir, artifactsDir } = await dirs();
  const first = sliceReporter({ label: "after", outDir, artifactsDir });
  await first.onEvalComplete(
    ...completed({
      id: "safety/at-ingest/pii-w9",
      caseId: "safety-pii-w9",
      tags: ["trap", "trust"],
    })
  );
  const second = sliceReporter({ label: "after", outDir, artifactsDir });
  await second.onEvalComplete(
    ...completed({
      id: "safety/approvals/0000",
      caseId: "safety-supersession-approve",
      tags: ["trap"],
    })
  );
  await second.onEvalComplete(
    ...completed({
      id: "safety/at-ingest/pii-w9",
      caseId: "safety-pii-w9",
      tags: ["trap"],
      verdict: "failed",
    })
  );

  assert.deepEqual(await readdir(join(outDir, "after")), ["safety.json"]);
  const report = await read(join(outDir, "after/safety.json"));
  assert.deepEqual(
    report.cases.map((c) => [c.id, c.verdict]),
    [
      ["safety/approvals/0000", "passed"],
      ["safety/at-ingest/pii-w9", "failed"],
    ]
  );
});

test("at run end the run's results.jsonl is copied beside the slices and every case points at it", async () => {
  const { outDir, artifactsDir, root } = await dirs();
  await mkdir(join(artifactsDir, "2026-10-19T09-00-00"), { recursive: true });
  await writeFile(
    join(artifactsDir, "2026-10-19T09-00-00/results.jsonl"),
    '{"id":"old"}\n'
  );
  const reporter = sliceReporter({
    label: "before",
    outDir,
    artifactsDir,
    repoRoot: root,
  });
  await reporter.onEvalComplete(
    ...completed({
      id: "ingest/sources/0001",
      caseId: "ingest-a",
      tags: ["edge"],
    })
  );
  await mkdir(join(artifactsDir, "2026-10-19T10-05-00"), { recursive: true });
  await writeFile(
    join(artifactsDir, "2026-10-19T10-05-00/results.jsonl"),
    '{"id":"ingest/sources/0001"}\n'
  );

  await reporter.onRunComplete(summary);

  const report = await read(join(outDir, "before/ingest.json"));
  assert.equal(
    report.cases[0]?.resultsJsonl,
    "docs/evals/runs/before/results/2026-10-19T10-05-00.jsonl"
  );
  assert.equal(
    await readFile(
      join(outDir, "before/results/2026-10-19T10-05-00.jsonl"),
      "utf8"
    ),
    '{"id":"ingest/sources/0001"}\n'
  );
});

test("a case without a class tag is reported as unclassified, and missing cost as null", async () => {
  const { outDir, artifactsDir } = await dirs();
  const reporter = sliceReporter({ label: "x", outDir, artifactsDir });
  await reporter.onEvalComplete(
    ...completed({ id: "query/0000", caseId: "q", tags: ["calibration"] })
  );

  const [only] = (await read(join(outDir, "x/query.json"))).cases;
  assert.equal(only?.class, "unclassified");
  assert.equal(only?.costUsd, null);
});
