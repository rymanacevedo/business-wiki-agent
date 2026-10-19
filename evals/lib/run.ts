import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EVAL_RUN_ENV, SEEDS, evalNamespace } from "../../agent/lib/eval-wiki";
import { readWikiDir } from "../../packages/wiki-check";
import type { Wiki } from "../../packages/ingest-expectations";

/** The pinned judge and its recorded fallback (spec #15). */
export const JUDGE_MODEL = "mistral/mistral-medium-3.5";
export const JUDGE_FALLBACK = "openai/gpt-oss-120b";
export const DEMO_DATE = "2026-10-17";

export type Seed = (typeof SEEDS)[number];

/** What setup shares with every eval and teardown. */
export type RunContext = {
  runId: string;
  seed: Seed;
  /** `<store>/eval/<runId>`: every session's namespace lives under it. */
  runDir: string;
  storeRoot: string;
};

export const runLabel = () => process.env.EVAL_RUN_LABEL || "local";

/**
 * Run setup: pin the Demo Date, pick the seed, and create the run directory.
 * The local eve dev server boots after setup and inherits these variables,
 * so its tools put each session under `eval/<runId>/<sessionId>`.
 */
export async function startRun(env = process.env): Promise<RunContext> {
  const seed = env.WIKI_SEED;
  if (!(SEEDS as readonly string[]).includes(seed ?? ""))
    throw new Error(
      `Set WIKI_SEED to ${SEEDS.join(" or ")}, e.g. WIKI_SEED=base eve eval ingest`
    );
  env.DEMO_DATE = DEMO_DATE;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const runId = `${runLabel().replace(/[^A-Za-z0-9_-]/g, "-")}-${stamp}`;
  env[EVAL_RUN_ENV] = runId;
  const storeRoot = resolve(env.WIKI_STORE_DIR ?? ".wiki-store");
  const runDir = join(storeRoot, "eval", runId);
  await mkdir(runDir, { recursive: true });
  return { runId, seed: seed as Seed, runDir, storeRoot };
}

/** Run teardown: delete the run's namespaces (keep them with CLERK_EVAL_KEEP=1). */
export async function endRun(run: RunContext | undefined): Promise<void> {
  if (!run || process.env.CLERK_EVAL_KEEP === "1") return;
  await rm(run.runDir, { recursive: true, force: true });
}

/** The seed Wiki the session started from. */
export function seedWiki(run: RunContext): Promise<Wiki> {
  return readWikiDir(resolve("fixtures", run.seed));
}

/** One session's Wiki as it stands now; empty if the session never touched the store. */
export async function sessionWiki(
  run: RunContext,
  sessionId: string
): Promise<Wiki> {
  const dir = join(run.storeRoot, evalNamespace(run.runId, sessionId));
  return existsSync(dir) ? readWikiDir(dir) : new Map();
}
