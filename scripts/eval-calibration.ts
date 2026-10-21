// Dump the Owner's calibration template for one committed eval run: one entry
// per `calibration`-tagged Query row (question, Clerk's answer, the Page text
// the judges read, blank faithful/cited), tied to the run's results.jsonl.
// Usage: bun scripts/eval-calibration.ts <label> [--wiki <dir>] [--root <repo>]
// Writes docs/evals/runs/<label>/calibration.yaml.
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadQueryCases } from "../evals/query/cases";
import {
  calibrationYaml,
  type ResultLine,
} from "../packages/eval-report/calibration";
import type { SliceReport } from "../packages/eval-report";
import { readWikiDir } from "../packages/wiki-check";

const USAGE =
  "Usage: bun scripts/eval-calibration.ts <label> [--wiki <dir>] [--root <repo>]";

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { wiki: { type: "string" }, root: { type: "string" } },
  });
  const [label] = positionals;
  if (!label || positionals.length !== 1) {
    console.error(USAGE);
    return 64;
  }
  const root = resolve(values.root ?? join(__dirname, ".."));
  const runDir = join(root, "docs/evals/runs", label);
  const query = JSON.parse(
    await readFile(join(runDir, "query.json"), "utf8")
  ) as SliceReport;
  const files = [
    ...new Set(query.cases.map((c) => c.resultsJsonl).filter((f) => f)),
  ] as string[];
  if (files.length !== 1) {
    console.error(
      `docs/evals/runs/${label}/query.json links ${files.length} results.jsonl files; expected 1`
    );
    return 1;
  }
  const resultsFile = join(root, files[0]!);
  const results = (await readFile(resultsFile, "utf8"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ResultLine);

  // Query rows never write (the trajectory gate), so they read their seed.
  const seed = "full";
  const wiki = await readWikiDir(
    resolve(root, values.wiki ?? `fixtures/${seed}`)
  );
  const cases = await loadQueryCases(join(root, "evals/query/questions.yaml"));
  const rows = cases.flatMap((c, i) =>
    c.tags.includes("calibration")
      ? [
          {
            evalId: `query/questions/${String(i).padStart(4, "0")}`,
            caseId: c.caseId,
            prompts: c.prompts,
            cites: [...c.cites, ...c.pages],
          },
        ]
      : []
  );

  const out = join(runDir, "calibration.yaml");
  const runId = basename(resultsFile, ".jsonl");
  await writeFile(
    out,
    `# Calibration template for eval run ${runId} (${files[0]}).\n` +
      calibrationYaml({ runId, label, seed, rows, results, wiki })
  );
  console.log(
    `Wrote docs/evals/runs/${label}/calibration.yaml: ${rows.length} entries, ${rows.length * 2} judgments to fill`
  );
  return 0;
}

main().then((code) => process.exit(code));
