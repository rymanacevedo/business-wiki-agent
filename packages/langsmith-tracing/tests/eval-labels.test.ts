import assert from "node:assert/strict";
import { test } from "node:test";
import { labelEvalSpans, type ExportableSpan } from "../index";

function span(
  name: string,
  traceId: string,
  attributes: Record<string, unknown> = {}
): ExportableSpan & { name: string } {
  return { name, attributes, spanContext: () => ({ traceId }) };
}

/** The OTLP exporter at the network edge: records what it was handed. */
function recorder() {
  const batches: ExportableSpan[][] = [];
  return {
    batches,
    exporter: {
      export(spans: readonly unknown[], done: (r: { code: number }) => void) {
        batches.push(spans as ExportableSpan[]);
        done({ code: 0 });
      },
      shutdown: async () => {},
    },
  };
}

function exportAll(
  exporter: ReturnType<typeof labelEvalSpans>,
  spans: ExportableSpan[]
) {
  exporter.export(spans, () => {});
}

test("stamps the run label on every span of an eval run", () => {
  const sink = recorder();
  const exporter = labelEvalSpans(sink.exporter, { EVAL_RUN_LABEL: "before" });
  exportAll(exporter, [
    span("invoke_agent clerk", "t1"),
    span("agent.step", "t1"),
  ]);
  for (const s of sink.batches[0]) {
    assert.equal(s.attributes["eval.run_label"], "before");
    assert.equal(s.attributes["langsmith.metadata.eval_run_label"], "before");
  }
});

test("the case id on a model step labels its whole trace, root included", () => {
  const sink = recorder();
  const exporter = labelEvalSpans(sink.exporter, { EVAL_RUN_LABEL: "before" });
  const caseContext = { "ai.settings.context.eval.case_id": "query-ein-01" };
  exportAll(exporter, [
    span("execute_tool read_index", "t1"),
    span("chat openai/gpt-5-mini", "t1", caseContext),
    span("agent.step", "t1", caseContext),
  ]);
  exportAll(exporter, [
    span("invoke_agent clerk", "t1"),
    span("agent.step", "t2"),
  ]);

  const [first, second] = sink.batches;
  for (const s of [...first, second[0]]) {
    assert.equal(s.attributes["eval.case_id"], "query-ein-01");
    assert.equal(
      s.attributes["langsmith.metadata.eval_case_id"],
      "query-ein-01"
    );
  }
  assert.equal(second[1].attributes["eval.case_id"], undefined);
});

test("outside an eval run spans pass through untouched", () => {
  const sink = recorder();
  const exporter = labelEvalSpans(sink.exporter, {});
  const root = span("invoke_agent clerk", "t1", {
    "gen_ai.agent.name": "clerk",
  });
  exportAll(exporter, [root]);
  assert.equal(sink.batches[0][0], root);
});

test("keeps the span's own identity and attributes", () => {
  const sink = recorder();
  const exporter = labelEvalSpans(sink.exporter, { EVAL_RUN_LABEL: "after" });
  exportAll(exporter, [span("agent.step", "t9", { "agent.step.index": 2 })]);
  const out = sink.batches[0][0] as ExportableSpan & { name: string };
  assert.equal(out.name, "agent.step");
  assert.equal(out.spanContext().traceId, "t9");
  assert.equal(out.attributes["agent.step.index"], 2);
});
