// Join two committed eval runs by eval id into docs/evals/before-after.md and
// the README table between <!-- eval-diff:start --> and <!-- eval-diff:end -->,
// or, with --block <name>, between <!-- eval-diff:<name>:start --> and
// <!-- eval-diff:<name>:end -->.
// Usage: bun scripts/eval-diff.ts <before-label> <after-label> [--block <name>] [--root <repo>]
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  diffRuns,
  readRun,
  rewriteReadmeBlock,
  type DatasetFix,
} from "../packages/eval-report/diff";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" }, block: { type: "string" } },
  });
  const [beforeLabel, afterLabel] = positionals;
  if (!beforeLabel || !afterLabel || positionals.length !== 2) {
    console.error(
      "Usage: bun scripts/eval-diff.ts <before-label> <after-label> [--block <name>] [--root <repo>]"
    );
    return 64;
  }
  if (values.block !== undefined && !/^[a-z0-9-]+$/.test(values.block)) {
    console.error(
      `--block takes a lowercase slug (letters, digits, hyphens), not "${values.block}"`
    );
    return 64;
  }
  const root = resolve(values.root ?? join(__dirname, ".."));
  const runs = join(root, "docs/evals/runs");
  for (const label of [beforeLabel, afterLabel])
    if (!(await exists(join(runs, label)))) {
      console.error(`No run docs/evals/runs/${label}/`);
      return 1;
    }
  const block = values.block;
  const blockName = block === undefined ? "eval-diff" : `eval-diff:${block}`;
  // Rows corrected between the runs (docs/evals/triage.md, "Applied in #28").
  // A named block reads its own list, dataset-fixes.<name>.json, if any: the
  // default list belongs to the before -> after pair.
  const fixesFile = join(
    root,
    block === undefined
      ? "docs/evals/dataset-fixes.json"
      : `docs/evals/dataset-fixes.${block}.json`
  );
  const datasetFixes = (await exists(fixesFile))
    ? (JSON.parse(await readFile(fixesFile, "utf8")) as DatasetFix[])
    : [];
  const { markdown, readmeBlock } = diffRuns(
    await readRun(runs, beforeLabel),
    await readRun(runs, afterLabel),
    datasetFixes
  );
  const page = join(root, "docs/evals/before-after.md");
  await mkdir(dirname(page), { recursive: true });
  await writeFile(page, markdown);
  console.log(
    `Wrote docs/evals/before-after.md (${beforeLabel} -> ${afterLabel})`
  );

  const readme = join(root, "README.md");
  if (!(await exists(readme))) {
    console.warn(`No README.md yet: skipped the ${blockName} block`);
    return 0;
  }
  try {
    await writeFile(
      readme,
      rewriteReadmeBlock(await readFile(readme, "utf8"), readmeBlock, block)
    );
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  console.log(`Rewrote the README ${blockName} block`);
  return 0;
}

main().then((code) => process.exit(code));
