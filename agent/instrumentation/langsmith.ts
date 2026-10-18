import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { otelIntegration } from "eve/instrumentation/otel";
import {
  evalCaseContext,
  isAgentSpan,
  labelEvalSpans,
  langsmithTarget,
} from "../../packages/langsmith-tracing";

// LangSmith over OTLP http/protobuf. Without LANGSMITH_API_KEY and
// LANGSMITH_PROJECT this destination has no exporter, so `eve dev` and evals
// run untraced (local traces still work). Content capture is decided by the
// process-wide policy in ./otel.ts.
const target = langsmithTarget(process.env);

export default otelIntegration(
  target === null
    ? {}
    : {
        exportPolicy: { span: (span) => ({ emit: isAgentSpan(span) }) },
        runtimeContext: (input) => evalCaseContext(input.session),
        traceExporter: labelEvalSpans(
          new OTLPHttpProtoTraceExporter({
            url: target.url,
            headers: target.headers,
          }),
          process.env
        ),
      }
);
