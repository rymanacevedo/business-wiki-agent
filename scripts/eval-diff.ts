// Join two committed eval runs by eval id into docs/evals/before-after.md and
// the README table between <!-- eval-diff:start --> and <!-- eval-diff:end -->.
// Usage: bun scripts/eval-diff.ts <before-label> <after-label> [--root <repo>]
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  diffRuns,
  readRun,
  rewriteReadmeBlock,
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
    options: { root: { type: "string" } },
  });
  const [beforeLabel, afterLabel] = positionals;
  if (!beforeLabel || !afterLabel || positionals.length !== 2) {
    console.error(
      "Usage: bun scripts/eval-diff.ts <before-label> <after-label> [--root <repo>]"
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
  const { markdown, readmeBlock } = diffRuns(
    await readRun(runs, beforeLabel),
    await readRun(runs, afterLabel)
  );
  const page = join(root, "docs/evals/before-after.md");
  await mkdir(dirname(page), { recursive: true });
  await writeFile(page, markdown);
  console.log(
    `Wrote docs/evals/before-after.md (${beforeLabel} -> ${afterLabel})`
  );

  const readme = join(root, "README.md");
  if (!(await exists(readme))) {
    console.warn("No README.md yet: skipped the eval-diff block");
    return 0;
  }
  try {
    await writeFile(
      readme,
      rewriteReadmeBlock(await readFile(readme, "utf8"), readmeBlock)
    );
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  console.log("Rewrote the README eval-diff block");
  return 0;
}

main().then((code) => process.exit(code));
