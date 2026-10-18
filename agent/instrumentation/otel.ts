import { otel } from "eve/instrumentation/otel";

// Record inputs and outputs for every session, in every environment. Without
// this, deployed web-chat sessions (private or unknown audience) export
// metadata only. Safe because Masking happens before the model: traces hold
// masked Source text only, and the Corpus is synthetic.
export default otel({
  resource: {
    "deployment.environment": process.env.VERCEL_ENV ?? "development",
  },
  tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }),
});
