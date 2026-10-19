import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import type { EveEvalResult } from "eve/evals";
import type { EvalReporter, EveEvalCompleteContext } from "eve/evals/reporters";
import { CLASSES, type CaseReport, type SliceReport } from "./types";

export type SliceReporterOptions = {
  /** `EVAL_RUN_LABEL`: names the run directory. */
  label: string;
  /** Where run directories live, e.g. `<repo>/docs/evals/runs`. */
  outDir: string;
  /** eve's artifact root, `<repo>/.eve/evals`. */
  artifactsDir: string;
  /** Paths in the report are relative to this (default: the cwd). */
  repoRoot?: string;
};

/** The slice is the top directory of the eval id; `safety/*` is one slice. */
export const sliceOf = (id: string) => id.split("/")[0]!;

function caseReport(
  result: EveEvalResult,
  context: EveEvalCompleteContext | undefined
): CaseReport {
  const evaluation = context?.evaluation;
  const tags = [...(evaluation?.tags ?? [])];
  const caseId = evaluation?.metadata?.caseId;
  const scores: Record<string, number> = {};
  for (const a of result.assertions)
    if (a.key !== undefined && a.severity === "soft" && a.score !== undefined)
      scores[a.key] = a.score;
  const report: CaseReport = {
    id: result.id,
    caseId: typeof caseId === "string" ? caseId : null,
    description: evaluation?.description ?? null,
    class: CLASSES.find((c) => tags.includes(c)) ?? "unclassified",
    tags,
    verdict: result.verdict,
    gates: result.assertions
      .filter((a) => a.severity === "gate")
      .map((a) => ({
        name: a.name,
        passed: a.passed === true && !a.errored,
        ...(a.message && a.passed !== true ? { message: a.message } : {}),
      })),
    scores,
    toolCalls: result.result.derived?.toolCallCount ?? 0,
    costUsd: result.result.derived?.usage?.costUsd ?? null,
    traceIds: [
      ...new Set(result.result.traceContexts?.map((t) => t.traceId) ?? []),
    ],
    resultsJsonl: null,
  };
  if (result.error) report.error = result.error;
  return report;
}

async function readSlice(file: string): Promise<CaseReport[]> {
  try {
    return (JSON.parse(await readFile(file, "utf8")) as SliceReport).cases;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** The newest artifact directory holding a `results.jsonl`, or null. */
async function latestArtifacts(root: string): Promise<string | null> {
  let names: string[];
  try {
    names = (await readdir(root)).sort().reverse();
  } catch {
    return null;
  }
  for (const name of names) {
    try {
      if ((await stat(join(root, name, "results.jsonl"))).isFile()) return name;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * A Markdown-friendly JSON reporter: one `<slice>.json` per slice under
 * `<outDir>/<label>/`, written from `onEvalComplete` (the only place tags and
 * metadata meet results). Cases merge by eval id, so the two `eve eval`
 * invocations of one run share a label. At run end eve's `results.jsonl` is
 * copied to `<label>/results/<artifact-dir>.jsonl` and linked from each case.
 */
export function sliceReporter(options: SliceReporterOptions): EvalReporter {
  const { label, outDir, artifactsDir, repoRoot = process.cwd() } = options;
  const runDir = join(outDir, label);
  const written = new Map<string, string[]>();
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  async function update(
    slice: string,
    change: (cases: CaseReport[]) => CaseReport[]
  ) {
    const file = join(runDir, `${slice}.json`);
    const cases = change(await readSlice(file)).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    const report: SliceReport = { label, slice, cases };
    await mkdir(runDir, { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  }

  return {
    onRunStart() {},
    onEvalComplete(result, context) {
      return serial(async () => {
        const slice = sliceOf(result.id);
        const report = caseReport(result, context);
        await update(slice, (cases) => [
          ...cases.filter((c) => c.id !== report.id),
          report,
        ]);
        written.set(slice, [...(written.get(slice) ?? []), report.id]);
      });
    },
    onRunComplete() {
      return serial(async () => {
        const artifact = await latestArtifacts(artifactsDir);
        if (!artifact || written.size === 0) return;
        const copy = join(runDir, "results", `${artifact}.jsonl`);
        await mkdir(join(runDir, "results"), { recursive: true });
        await copyFile(join(artifactsDir, artifact, "results.jsonl"), copy);
        const path = relative(repoRoot, copy).replaceAll("\\", "/");
        for (const [slice, ids] of written)
          await update(slice, (cases) =>
            cases.map((c) =>
              ids.includes(c.id) ? { ...c, resultsJsonl: path } : c
            )
          );
      });
    },
  };
}
