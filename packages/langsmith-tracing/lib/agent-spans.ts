export interface SpanSummary {
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

/** Eve's run tree carries GenAI operation names; approvals are `agent.*`. */
export function agentSpan(span: SpanSummary): boolean {
  return (
    "gen_ai.operation.name" in span.attributes || span.name.startsWith("agent.")
  );
}
