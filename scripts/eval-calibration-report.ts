// Join the Owner's labels in docs/evals/runs/<label>/calibration.yaml to the
// same run's judge scores (query.json) by eval id and write
// docs/evals/calibration.md. Re-run after filling or changing labels.
// Usage: bun scripts/eval-calibration-report.ts <label> [--current 0.7] [--root <repo>]
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadYaml } from "eve/evals/loaders";
import type { SliceReport } from "../packages/eval-report";
import {
  calibrationReport,
  type OwnerLabel,
} from "../packages/eval-report/calibration";

const USAGE =
  "Usage: bun scripts/eval-calibration-report.ts <label> [--current 0.7] [--root <repo>]";

type Entry = {
  evalId?: string;
  caseId?: string;
  faithful?: unknown;
  cited?: unknown;
};

function judgment(value: unknown, where: string): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  throw new Error(
    `${where}: expected true, false, or null, got ${String(value)}`
  );
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { current: { type: "string" }, root: { type: "string" } },
  });
  const [label] = positionals;
  const current = Number(values.current ?? "0.7");
  if (!label || positionals.length !== 1 || !(current > 0 && current <= 1)) {
    console.error(USAGE);
    return 64;
  }
  const root = resolve(values.root ?? join(__dirname, ".."));
  const runDir = join(root, "docs/evals/runs", label);
  const yamlPath = `docs/evals/runs/${label}/calibration.yaml`;
  const doc = (await loadYaml(join(root, yamlPath))) as { entries?: Entry[] };
  const labels: OwnerLabel[] = (doc.entries ?? []).map((e, i) => {
    if (!e.evalId || !e.caseId)
      throw new Error(`${yamlPath} entry ${i}: no evalId or caseId`);
    return {
      evalId: e.evalId,
      caseId: e.caseId,
      faithful: judgment(e.faithful, `${yamlPath} ${e.caseId} faithful`),
      cited: judgment(e.cited, `${yamlPath} ${e.caseId} cited`),
    };
  });
  const query = JSON.parse(
    await readFile(join(runDir, "query.json"), "utf8")
  ) as SliceReport;

  const report = calibrationReport({
    run: label,
    labels,
    judged: query.cases,
    currentThreshold: current,
  });
  await writeFile(join(root, "docs/evals/calibration.md"), report.markdown);
  console.log(
    `Wrote docs/evals/calibration.md (${report.form}${report.thresholds ? `: ${JSON.stringify(report.thresholds)}` : ""})`
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  }
);
