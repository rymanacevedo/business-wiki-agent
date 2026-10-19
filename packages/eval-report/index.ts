/**
 * Committed eval results: `sliceReporter` is an eve `EvalReporter` that
 * writes `docs/evals/runs/<label>/<slice>.json`. The before/after diff over
 * two such runs is the `diff.ts` entry point.
 */
export {
  sliceOf,
  sliceReporter,
  type SliceReporterOptions,
} from "./lib/reporter";
export type { CaseReport, SliceReport } from "./lib/types";
