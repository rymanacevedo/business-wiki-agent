import type { Env } from "./target";

export interface ExportableSpan {
  readonly attributes: Readonly<Record<string, unknown>>;
  spanContext(): { readonly traceId: string };
}

export interface SpanExporter {
  export(
    spans: readonly unknown[],
    resultCallback: (result: { code: number; error?: Error }) => void
  ): void;
  forceFlush?(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Span attributes, and the `langsmith.metadata.*` keys LangSmith shows as metadata. */
function labels(runLabel: string | undefined): Record<string, string> {
  if (!runLabel) return {};
  return {
    "eval.run_label": runLabel,
    "langsmith.metadata.eval_run_label": runLabel,
  };
}

/**
 * A span that reads like the original but carries extra attributes. The
 * OTLP serializer calls methods such as `spanContext()`, so the original
 * stays the prototype rather than being copied.
 */
function withAttributes(
  span: ExportableSpan,
  extra: Record<string, string>
): ExportableSpan {
  if (Object.keys(extra).length === 0) return span;
  return Object.create(span, {
    attributes: { value: { ...span.attributes, ...extra }, enumerable: true },
  });
}

/** Where the agent's `runtimeContext` puts the case id (on step and chat spans). */
export const CASE_CONTEXT_ATTRIBUTE = "ai.settings.context.eval.case_id";

/** Traces remembered so a root span exported after its steps gets the case id. */
const REMEMBERED_TRACES = 1000;

export function evalLabels(exporter: SpanExporter, env: Env): SpanExporter {
  const runLabels = labels(env.EVAL_RUN_LABEL);
  const caseByTrace = new Map<string, string>();

  function learn(span: ExportableSpan): void {
    const caseId = span.attributes[CASE_CONTEXT_ATTRIBUTE];
    if (typeof caseId !== "string" || caseId === "") return;
    const traceId = span.spanContext().traceId;
    caseByTrace.delete(traceId);
    caseByTrace.set(traceId, caseId);
    if (caseByTrace.size > REMEMBERED_TRACES) {
      caseByTrace.delete(caseByTrace.keys().next().value!);
    }
  }

  function label(span: ExportableSpan): ExportableSpan {
    const caseId = caseByTrace.get(span.spanContext().traceId);
    const caseLabels: Record<string, string> = caseId
      ? { "eval.case_id": caseId, "langsmith.metadata.eval_case_id": caseId }
      : {};
    return withAttributes(span, { ...runLabels, ...caseLabels });
  }

  return {
    export(spans, done) {
      const batch = spans as ExportableSpan[];
      batch.forEach(learn);
      exporter.export(batch.map(label), done);
    },
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
    shutdown: () => exporter.shutdown(),
  };
}
