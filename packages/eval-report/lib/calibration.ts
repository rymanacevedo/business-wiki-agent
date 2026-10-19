import { judgedPages, type Pattern } from "../../answer-checks";
import { toYaml } from "./yaml";

/** One `calibration`-tagged Query row, keyed by its eve eval id. */
export type CalibrationRow = {
  evalId: string;
  caseId: string;
  /** One message per turn; the last is the question judged. */
  prompts: string[];
  /** The row's `cites` and `pages` patterns: what the judges read besides linked Pages. */
  cites: Pattern[];
};

/** The fields of an eve `results.jsonl` line the dump reads. */
export type ResultLine = {
  id: string;
  verdict?: string;
  output?: string;
  traceContexts?: { traceId: string; sessionId?: string; primary?: boolean }[];
};

export type CalibrationInput = {
  /** eve's run id: the `results.jsonl` artifact directory name. */
  runId: string;
  label: string;
  seed: string;
  rows: CalibrationRow[];
  results: ResultLine[];
  /** The Wiki the sessions read (path to Markdown). */
  wiki: ReadonlyMap<string, string>;
};

function entry(
  row: CalibrationRow,
  result: ResultLine | undefined,
  wiki: ReadonlyMap<string, string>
) {
  const answer = result?.output ?? null;
  const trace =
    result?.traceContexts?.find((t) => t.primary) ?? result?.traceContexts?.[0];
  const paths =
    answer === null ? [] : judgedPages(row.cites, answer, [...wiki.keys()]);
  return {
    caseId: row.caseId,
    evalId: row.evalId,
    traceId: trace?.traceId ?? null,
    ...(row.prompts.length > 1
      ? { earlierTurns: row.prompts.slice(0, -1) }
      : {}),
    question: row.prompts.at(-1) ?? "",
    answer,
    ...(result === undefined
      ? { missing: "no results.jsonl line for this eval" }
      : result.verdict === "skipped"
        ? { missing: "skipped in this run" }
        : {}),
    pages: Object.fromEntries(paths.map((p) => [p, wiki.get(p) ?? ""])),
    faithful: null,
    cited: null,
  };
}

/**
 * The Owner's calibration template for one run: one entry per calibration
 * row with the question, Clerk's answer, and the text of the Pages the
 * judges read (the Index, the row's expected Pages, every Page the answer
 * links), and blank `faithful` and `cited` fields to fill by hand.
 */
export function calibrationYaml(input: CalibrationInput): string {
  const byId = new Map(input.results.map((r) => [r.id, r]));
  const doc = {
    run: { id: input.runId, label: input.label, seed: input.seed },
    instructions:
      "For each entry set faithful and cited to true or false. faithful: every factual claim in the answer is supported by the pages. cited: each fact the answer takes from the Wiki carries a Citation (src: <source-id>) or a /wiki/<path> link to a Page that holds it.",
    entries: input.rows.map((row) =>
      entry(row, byId.get(row.evalId), input.wiki)
    ),
  };
  return toYaml(doc);
}
