import { agentSpan, type SpanSummary } from "./lib/agent-spans";
import {
  caseContext,
  EVAL_CASE_HEADER,
  withCase,
  type SessionAuth,
  type SessionAuthSnapshot,
} from "./lib/eval-case";
import {
  evalLabels,
  type ExportableSpan,
  type SpanExporter,
} from "./lib/eval-labels";
import { target, type Env, type LangSmithTarget } from "./lib/target";

export type {
  Env,
  ExportableSpan,
  LangSmithTarget,
  SessionAuth,
  SessionAuthSnapshot,
  SpanExporter,
  SpanSummary,
};

/**
 * Where Clerk's traces go: LangSmith's OTLP traces endpoint, with the API
 * key and project passed as headers (the `@vercel/otel` exporter ignores the
 * standard OTLP env vars). `null` when LangSmith is not configured, which
 * disables export.
 */
export function langsmithTarget(env: Env): LangSmithTarget | null {
  return target(env);
}

/**
 * Wraps the exporter so an eval run's spans carry `EVAL_RUN_LABEL` and the
 * case id as span attributes (`eval.run_label`, `eval.case_id`), mirrored
 * as `langsmith.metadata.*` so LangSmith can filter on them. Outside an
 * eval run (no label, no case) spans pass through unchanged.
 */
export { EVAL_CASE_HEADER };

/**
 * Whether a span belongs to the agent run tree (`invoke_agent > agent.step >
 * chat / execute_tool`, plus `agent.approval`). Eve also emits Workflow
 * runtime spans (`workflow.*`, `step.*`, `queue.*`) as separate root traces,
 * dozens per turn; they would bury the agent traces and spend LangSmith's
 * trace quota, so the LangSmith destination drops them.
 */
export function isAgentSpan(span: SpanSummary): boolean {
  return agentSpan(span);
}

/**
 * Channel side of the case id: an eval sends its case id in the
 * `x-eval-case-id` request header; this copies it onto the session's auth
 * attributes so it survives the turn. Ids that are not short slugs are
 * ignored. Anonymous requests (no auth) are left alone.
 */
export function withEvalCase<A extends SessionAuth>(
  auth: A | null,
  headers: Headers
): A | null {
  return withCase(auth, headers);
}

/**
 * Instrumentation side: the runtime context Eve stamps on each model step
 * (`ai.settings.context.eval.case_id`), which `labelEvalSpans` spreads to
 * the whole trace. `undefined` outside eval sessions.
 */
export function evalCaseContext(
  session: SessionAuthSnapshot
): { readonly "eval.case_id": string } | undefined {
  return caseContext(session);
}

export function labelEvalSpans(exporter: SpanExporter, env: Env): SpanExporter {
  return evalLabels(exporter, env);
}
