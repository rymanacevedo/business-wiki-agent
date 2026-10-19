import { resolve } from "node:path";
import { defineEvalConfig } from "eve/evals";
import { gatewayChatJudge } from "../packages/chat-judge";
import { sliceReporter } from "../packages/eval-report";
import { endRun, JUDGE_MODEL, runLabel, startRun } from "./lib/run";

// One seed per invocation, chosen by WIKI_SEED:
//   WIKI_SEED=base eve eval ingest safety/at-ingest
//   WIKI_SEED=full eve eval query lint safety/approvals safety/runtime
// EVAL_RUN_LABEL names the run (docs/evals/runs/<label>/) and tags its traces.
export default defineEvalConfig({
  // The free Gateway tier has no decision models, so the judge is a chat model
  // behind a DecisionModelV4 adapter (fallback: JUDGE_FALLBACK in lib/run.ts).
  judge: { model: gatewayChatJudge(JUDGE_MODEL) },
  reporters: [
    sliceReporter({
      label: runLabel(),
      outDir: resolve("docs/evals/runs"),
      artifactsDir: resolve(".eve/evals"),
    }),
  ],
  maxConcurrency: 4,
  // Ingest and "ingest everything" cases set 240 s on the eval itself.
  timeoutMs: 120_000,
  setup: () => startRun(),
  teardown: (run) => endRun(run),
});
