/** The class tags: exactly one per case. */
export const CLASSES = ["normal", "edge", "trap"] as const;

export type CaseReport = {
  /** eve's path-derived eval id, the join key between runs. */
  id: string;
  caseId: string | null;
  description: string | null;
  class: (typeof CLASSES)[number] | "unclassified";
  tags: string[];
  verdict: "passed" | "failed" | "scored" | "skipped";
  gates: { name: string; passed: boolean; message?: string }[];
  /** Labelled soft scores, by label. */
  scores: Record<string, number>;
  toolCalls: number;
  costUsd: number | null;
  traceIds: string[];
  /** The run's copied `results.jsonl`, repo-relative; null until the run ends. */
  resultsJsonl: string | null;
  error?: string;
};

/** `docs/evals/runs/<label>/<slice>.json` */
export type SliceReport = {
  label: string;
  slice: string;
  cases: CaseReport[];
};
