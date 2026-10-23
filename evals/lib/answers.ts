import type { EveEvalContext, EveEvalStreamEvent } from "eve/evals";
import {
  retrievalMetrics,
  type Check,
  type Pattern,
  type ToolCallOutput,
} from "../../packages/answer-checks";

/** The tools a Query or Lint must never call: they write the Wiki. */
export const WRITE_TOOLS = [
  "create_page",
  "update_page",
  "change_fact",
  "note_also_seen_in",
];

/** Record each deterministic check as a named gate. */
export function gateChecks(t: EveEvalContext<unknown>, checks: Check[]) {
  for (const check of checks)
    t.score({ score: check.passed ? 1 : 0, message: check.detail })
      .label(check.name)
      .gate(1);
}

/**
 * Record what retrieval did in the row (spec #53): five soft 0/1 scores from
 * `search_wiki`'s full `execute` outputs, with no gate. A row without `cites`
 * records only `searched`, `rung_embedding` and `hop_added`.
 */
export function scoreRetrieval(
  t: EveEvalContext<unknown>,
  cites: readonly Pattern[],
  calls: readonly ToolCallOutput[]
) {
  for (const [label, score] of Object.entries(retrievalMetrics(cites, calls)))
    t.score({ score }).label(label);
}

/** The first tool call the model requested in the run, or undefined. */
export function firstToolCall(
  events: readonly EveEvalStreamEvent[]
): string | undefined {
  for (const event of events) {
    if (event.type !== "actions.requested") continue;
    for (const action of event.data.actions)
      if (action.kind === "tool-call" || action.kind === "workflow-tool-call")
        return action.toolName;
  }
  return undefined;
}

/**
 * The standard Query trajectory (eval-design item 10): `read_index` first,
 * at most 8 tool calls, and none of the write tools.
 */
export function standardTrajectory(t: EveEvalContext<unknown>) {
  t.eventsSatisfy(
    "first tool call is read_index",
    (events) => firstToolCall(events) === "read_index"
  );
  t.maxToolCalls(8);
  for (const tool of WRITE_TOOLS) t.notCalledTool(tool);
}
