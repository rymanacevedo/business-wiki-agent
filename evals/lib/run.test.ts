import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { endRun, startRun } from "./run";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function env(extra: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "clerk-eval-run-"));
  roots.push(root);
  return {
    WIKI_STORE_DIR: root,
    EVAL_RUN_LABEL: "before",
    ...extra,
  } as NodeJS.ProcessEnv;
}

test("setup pins the Demo Date, names the run, and creates its directory; teardown deletes it", async () => {
  const vars = env({ WIKI_SEED: "base" });
  const saved = process.env.EVAL_RUN_LABEL;
  process.env.EVAL_RUN_LABEL = "before";
  const run = await startRun(vars);
  process.env.EVAL_RUN_LABEL = saved;

  assert.equal(vars.DEMO_DATE, "2026-10-17");
  assert.equal(vars.CLERK_EVAL_RUN, run.runId);
  assert.match(run.runId, /^before-\d{14}$/);
  assert.equal(run.seed, "base");
  assert.ok(existsSync(run.runDir));
  mkdirSync(join(run.runDir, "wrun_1"));
  writeFileSync(join(run.runDir, "wrun_1/index.md"), "x");

  await endRun(run);
  assert.equal(existsSync(run.runDir), false);
});

test("setup refuses a missing or unknown WIKI_SEED", async () => {
  await assert.rejects(startRun(env({})), /WIKI_SEED/);
  await assert.rejects(startRun(env({ WIKI_SEED: "prototype" })), /WIKI_SEED/);
});
