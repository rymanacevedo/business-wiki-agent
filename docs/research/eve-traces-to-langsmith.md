# Exporting Eve traces to LangSmith over OpenTelemetry

Research for issue #3 (part of map #1). Date: 2026-10-17. Primary sources only; every claim is
followed by a bracketed source key that resolves in the [Sources](#sources) list at the end.

Versions observed while researching: `eve` 0.80.1 (vercel/eve `main` at commit `6210b1d`,
2026-10-16) [EVE-PKG]; `@vercel/otel` 2.1.3 [VOTEL-PKG]; `langsmith` JS SDK 0.10.9 [LS-PKG];
Braintrust's Eve integration requires `braintrust` >= 3.37.0 [BT-EVE].

## Short answer

Yes. Eve has a first-class "add an OpenTelemetry destination" surface: one file under
`agent/instrumentation/` that default-exports `otelIntegration({ traceExporter })`, and Eve
batches the spans into it [EVE-OTEL]. LangSmith accepts OTLP/HTTP traces at
`https://api.smith.langchain.com/otel/v1/traces` with an `x-api-key` header and an optional
`Langsmith-Project` header [LS-OTEL]. No `eve add instrumentation/langsmith` item exists in Eve's
registry (the observability entries are Braintrust, PostHog, Sentry, Datadog, Honeycomb, Arize,
Raindrop, Jaeger) [EVE-INTEG], so the LangSmith file is hand-written on the same pattern Eve
documents for Honeycomb and Arize [EVE-HONEY] [EVE-ARIZE].

The main risk is rendering, not transport. Eve writes OTel GenAI semantic-convention attributes.
LangSmith's documented mapping covers the model-call attributes (`gen_ai.input.messages`,
`gen_ai.output.messages`, `gen_ai.usage.*`, `gen_ai.request.model`) and sets run type `tool` from
`gen_ai.tool.name`, but it does not list the attributes Eve uses for tool arguments and results
(`gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`) [LS-OTEL] [EVE-SPANKINDS]. Tool runs
may therefore appear in LangSmith with the right name and type but empty inputs/outputs unless we
add a small attribute-mapping step (section 6.2). That is the thing to verify on day one, and it
is the fallback trigger (section 6.3).

## 1. What Eve's instrumentation supports

### 1.1 Files and API surface

- Instrumentation lives in path-named files under `agent/instrumentation/`. Each file handles
  events independently. `agent/instrumentation.ts` is gone; since `eve` 0.62.0 the directory is
  the supported API and a leftover `instrumentation.ts` fails `eve build` [EVE-INSTR] [EVE-MIG]
  [EVE-CL-062].
- Two OTel halves: `otel()` (declare at most once; process-wide resource, sampler, propagators,
  `tracePolicy`, `instrumentations`) and `otelIntegration()` (one file per third-party
  destination; `traceExporter`, `spanProcessors`, `metricReaders`, `exportPolicy`,
  `runtimeContext`) [EVE-OTEL] [EVE-OTELDECL].
- A `traceExporter` is "wrapped in eve's batching processor" and appended after any
  `spanProcessors` [EVE-OTELDECL]. Eve types the exporter structurally ("the instance comes from
  whichever `@opentelemetry/*` build the app installed"), so any OTLP exporter object with
  `export/shutdown` works, not only `@vercel/otel`'s [EVE-OTELCONF].
- `eve` declares `@opentelemetry/api` as an optional peer dependency and nothing else OTel-related;
  `@vercel/otel` is installed by the app (`pnpm add @vercel/otel`) when its exporters are used
  [EVE-PKG] [EVE-OTEL].

### 1.2 Exporters and env vars

- Eve's documented exporter is `OTLPHttpProtoTraceExporter` from `@vercel/otel`, constructed with
  `{ url, headers }` [EVE-OTEL] [EVE-HONEY]. Its config type is exactly
  `{ headers?: Record<string, unknown>; url?: string }` and it sends `application/x-protobuf`
  (OTLP http/protobuf) [VOTEL-PROTO] [VOTEL-CONFIG].
- `@vercel/otel`'s exporter does not read `OTEL_EXPORTER_OTLP_ENDPOINT` or
  `OTEL_EXPORTER_OTLP_HEADERS`; when `url` is omitted it defaults to
  `http://localhost:4318/v1/traces` [VOTEL-TRACECFG]. So in Eve the URL and headers must be
  passed explicitly from whatever env vars we choose.
- Eve itself defines no LangSmith- or OTLP-specific env vars. The only env vars it consults for
  tracing behaviour are `VERCEL_ENV` (seeds the Agent Runs destination in `preview`/`production`,
  and selects the trace environment) and the internal `EVE_DEV=1` flag that `eve dev` sets
  [EVE-PROVIDERS] [EVE-DEVENV].

### 1.3 Span shape (trace schema version 4)

Documented topology for one agent turn [EVE-OTEL]:

```text
invoke_agent <agent>
  └── agent.step
        ├── chat <model>
        └── execute_tool <tool>
```

Each root turn starts a new trace; a local subagent's first turn joins the caller's trace; later
child turns start new traces; `gen_ai.conversation.id` ties a session's traces together and
`agent.run.id` identifies one session [EVE-OTEL]. Tool calls are a single `execute_tool` span
since 0.72.0 [EVE-CL-072]; approvals are an `agent.approval` child of the tool span
[EVE-SPANKINDS].

Attributes, from `packages/tracing/src/core/span-kinds.ts` and `content-policy.ts` in the Eve
repo [EVE-SPANKINDS] [EVE-CONTENTPOLICY]:

| Span | Key attributes |
| --- | --- |
| `invoke_agent <agent>` (root) | `gen_ai.operation.name=invoke_agent`, `gen_ai.agent.name`, `agent.run.id`, `agent.run.type` (`session`/`subagent`), `agent.channel.kind`, `agent.trace.content.input/output` (booleans recording the capture decision) |
| `agent.step` | `gen_ai.operation.name=workflow`, `agent.turn.id`, `agent.step.index`, `agent.step.attempt`, runtime-context values under `ai.settings.context.*` |
| `chat <model>` (`CLIENT`) | `gen_ai.operation.name=chat`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.input.messages` (JSON, GenAI message schema), `gen_ai.system_instructions`, `gen_ai.tool.definitions`, `gen_ai.output.messages`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_write.input_tokens`, `gen_ai.response.model/id/finish_reasons`, `agent.input.messages.omitted` |
| `execute_tool <tool>` | `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.type=function`, `gen_ai.tool.call.arguments` (JSON), `gen_ai.tool.call.result` (JSON), `agent.action.kind/name/outcome`, `error.type` on failure |
| `agent.approval` | `agent.approval.request/response`, `agent.approval.outcome`, `gen_ai.tool.call.id` |

Notes on content:

- Prompts, tool arguments, and results are captured as span attributes when the trace policy
  allows it. Inputs cover "model prompts, tool arguments, channel input, and user responses";
  outputs cover "model responses, tool results, requests for user input, model provider metadata,
  and error details" [EVE-INSTR].
- Each content attribute is capped at 32 KiB; an oversized prompt drops the oldest messages and
  records how many under `agent.input.messages.omitted`; oversized responses and tool results are
  truncated with a marker [EVE-SERIAL] [EVE-CL-0791]. For long wiki-ingest turns this means the
  trace shows the tail of the conversation, not all of it.
- `gen_ai.input.messages` uses the OTel GenAI message schema (`{ role, parts: [{ type: "text",
  content }] }`), excluding the system message, which goes to `gen_ai.system_instructions`
  [EVE-SERIAL].
- Eve's content-policy list also names AI SDK attributes (`ai.prompt`, `ai.response.text`,
  `ai.toolCall.args`, ...) that "the AI SDK's OpenTelemetry integration sets on the model-call
  spans beneath" Eve's spans [EVE-CONTENTPOLICY]. Whether those AI SDK spans are still emitted
  after 0.79.0 moved Eve's spans to the shared tracing library is not stated in the docs; treat
  it as something to look at in the first exported trace.

### 1.4 Content capture policy (what reviewers will actually see)

- Without a policy, Eve sends metadata for every trace and includes inputs/outputs only in
  development, or in preview/production when the session audience is `public`. Preview or
  production with audience `private` or `unknown` gets metadata only [EVE-INSTR].
- Audience is assigned by the channel. For Eve's default HTTP channel: anonymous caller ->
  `unknown`; `user`/`service`/`runtime` principal -> `private`; anything else -> `unknown`.
  Setting `audience: "public"` on `eveChannel()` makes all sessions public for capture purposes
  [EVE-CHAN-EVE].
- Environment is `development` when `EVE_DEV=1` (the `eve dev` TUI) or `VERCEL_ENV=development`;
  `preview` when `VERCEL_ENV=preview`; otherwise `production` [EVE-DEVENV].
- `otel({ tracePolicy })` is the process-wide ceiling for all OTel destinations; a destination's
  `exportPolicy` can only narrow it [EVE-OTEL]. Since 0.79.1 an explicit policy that enables
  inputs/outputs is honoured for DMs, private channels, and unknown audiences [EVE-CL-0791].
- Since 0.80.0 the resolved capture decision also selects Workflow run-data retention: allowing
  both directions keeps the World default; dropping the trace or excluding a direction requests
  deletion of durable payloads when the run ends. `experimental.workflow.retention: "default"`
  decouples them [EVE-OTEL] [EVE-CL-080].

Consequence for this project: a deployed demo whose web chat is anonymous or placeholder-authed
will export metadata-only traces to LangSmith unless we set an explicit `tracePolicy` returning
`recordInputs: true, recordOutputs: true`. The data is synthetic take-home material, so that is
acceptable; the spec should say so.

### 1.5 Local dev vs Vercel

| | `eve dev` (local) | Vercel preview/production |
| --- | --- | --- |
| Default destinations | Local trace spool, viewed with `/traces` in the TUI; `agent/instrumentation/local.ts` can reconfigure or disable it [EVE-OTEL] [EVE-TUI] | Vercel Agent Runs, seeded automatically when `VERCEL_ENV` is `preview` or `production`; `agent/instrumentation/agent-runs.ts` can narrow or disable [EVE-AGENTRUNS] [EVE-PROVIDERS] |
| Third-party `otelIntegration()` files | Loaded; "In `eve dev` and built servers, eve awaits every provider's setup before loading the server entry" [EVE-INSTR] | Loaded the same way |
| Content default | Inputs and outputs for any audience [EVE-INSTR] | Public audience only [EVE-INSTR] |
| Sampling | n/a | New projects created by `eve deploy` get 100 % sampling; existing projects need a Settings -> Tracing rule at 100 % or `vercel traces config` [EVE-AGENTRUNS] [EVE-DEPLOY] |
| `eve eval` | Boots a local dev server (or `--url` targets a deployment); the same instrumentation files load; reporters receive each session's `traceId` and the Braintrust reporter stores `eveTraceIds`/`eveTraceContexts` in experiment metadata [EVE-EVALS-TARGETS] [EVE-EVALS-REPORTERS] | same via `--url` |

Agent Runs is Beta on Hobby, Pro, and Enterprise, billed at Always-on Tracing rates, with 30-day
retention during beta; the project tab "requires enablement for your Vercel team" [EVE-AGENTRUNS]
[VERCEL-AGENTRUNS]. It shows per-turn input/output, reasoning, and tool calls with arguments and
results [VERCEL-AGENTRUNS]. Neither Vercel page documents sharing a run outside the team.

### 1.6 Eve observability integrations listed

Registry entries under "instrumentation" [EVE-INTEG]: Braintrust (native SDK integration,
`braintrustEveInstrumentation`, not OTLP) [EVE-BT]; PostHog; Sentry; Datadog; Honeycomb (OTLP via
`OTLPHttpProtoTraceExporter`) [EVE-HONEY]; Arize (same pattern) [EVE-ARIZE]; Raindrop; Jaeger.
Also Jetty for grading. No LangSmith entry. The `/add` TUI picker lists these same items
[EVE-TUI] [EVE-CL-0751].

## 2. LangSmith OTel ingestion

- Endpoint: base `https://api.smith.langchain.com/otel`; OTLP/HTTP exporters append
  `/v1/traces`. Full traces URL `https://api.smith.langchain.com/otel/v1/traces` (what the
  collector example and the `@vercel/otel` exporter need, since the latter takes a full URL).
  Setting the base URL to the full path yields `/otel/v1/traces/v1/traces` and a 404 [LS-OTEL].
- Regional hosts: `eu.api.smith.langchain.com` (GCP EU), `apac.api.smith.langchain.com`,
  `aws.api.smith.langchain.com`; self-hosted uses `<host>/api/v1/otel` [LS-OTEL].
- Headers: `x-api-key=<LangSmith API key>`; optional `Langsmith-Project=<project name>` (default
  project is "default"). On agent-based workspaces the OTLP path reads no agent address; use
  `Langsmith-Project` [LS-OTEL].
- Env vars documented for generic OTel clients: `OTEL_EXPORTER_OTLP_ENDPOINT` and
  `OTEL_EXPORTER_OTLP_HEADERS` (per-signal `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` takes the full
  path). `LANGSMITH_OTEL_ENABLED=true`, `LANGSMITH_TRACING=true`, `LANGSMITH_ENDPOINT`,
  `LANGSMITH_API_KEY`, `LANGSMITH_WORKSPACE_ID` apply to the LangChain/LangSmith SDK integration,
  not to a raw OTLP exporter [LS-OTEL]. `LANGSMITH_PROJECT` is not mentioned on the OTel page; the
  JS SDK exporter reads it (see below).
- Protocol: the page's examples and collector config use OTLP/HTTP (`otlphttp`), i.e.
  http/protobuf; gRPC direct to LangSmith is not documented [LS-OTEL]. `@vercel/otel`'s proto
  exporter matches.
- Spans to runs: one span becomes one run; `parentSpanId` nests runs; run IDs derive from the
  OTLP span ID unless `langsmith.span.id`/`langsmith.trace.id`/`langsmith.span.parent_id`/
  `langsmith.span.dotted_order` override them. A span whose parent never reaches LangSmith is
  dropped silently [LS-OTEL].
- Run type: `langsmith.span.kind` (`llm`, `chain`, `tool`, `retriever`, `embedding`, `prompt`,
  `parser`) or inferred: `gen_ai.operation.name` `chat`/`completion` -> `llm`, `embedding` ->
  `embedding`; `gen_ai.tool.name` -> `tool`; OpenInference `openinference.span.kind`; TraceLoop
  `traceloop.span.kind` [LS-OTEL] [LS-RUNTYPES]. `invoke_agent`, `workflow`, and `execute_tool`
  are not listed as recognised `gen_ai.operation.name` values.
- Content mapping relevant to Eve [LS-OTEL]:

| Eve attribute | LangSmith field | Status |
| --- | --- | --- |
| `gen_ai.input.messages` | `inputs.messages` ("Array of input messages") | mapped |
| `gen_ai.output.messages` | `outputs.messages` | mapped |
| `gen_ai.request.model`, `gen_ai.response.model` | `invocation_params.model` | mapped |
| `gen_ai.usage.input_tokens`, `output_tokens`, `cache_read.input_tokens`, `cache_write.input_tokens` | `usage_metadata.*` | mapped |
| `gen_ai.tool.name` | `invocation_params.tool_name` + run type `tool` | mapped |
| `gen_ai.provider.name` | not listed (`gen_ai.system` -> `metadata.ls_provider` is) | unmapped |
| `gen_ai.system_instructions`, `gen_ai.tool.definitions` | not listed | unmapped |
| `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` | not listed | unmapped |
| `agent.*`, `ai.settings.context.*` | not listed | unmapped (fate of unlisted attributes is not documented) |

  GenAI semantic conventions are therefore sufficient for model-call runs to render (messages and
  tokens), and for tool runs to be typed and named, but not documented as sufficient for tool
  inputs/outputs. The generic fallbacks LangSmith does document are OpenInference `input.value` /
  `output.value` -> `inputs`/`outputs`, and `langsmith.span.kind` for run type [LS-OTEL].
  Resource attributes (`OTEL_RESOURCE_ATTRIBUTES` or Eve's `otel({ resource })`) appear in trace
  metadata [LS-OTEL].

- The LangSmith JS SDK ships `LangSmithOTLPTraceExporter` (`langsmith/experimental/otel/exporter`),
  which extends `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-proto`, defaults the
  URL to `${LANGSMITH_ENDPOINT}/otel/v1/traces`, sets `x-api-key` from `LANGSMITH_API_KEY` unless
  `OTEL_EXPORTER_OTLP_HEADERS` is set, stamps `langsmith.trace.session_name` from
  `LANGSMITH_PROJECT` / `projectName`, exposes `transformExportedSpan(span)` for adding or
  removing attributes, and rewrites Vercel AI SDK `ai.*` attributes into LangSmith fields
  [LS-EXPORTER]. Caveat: its `export()` is a silent no-op unless `LANGSMITH_TRACING=true` (or
  `LANGSMITH_TRACING_V2=true`) [LS-EXPORTER] [LS-ENV]. Peer deps: `@opentelemetry/api`,
  `@opentelemetry/exporter-trace-otlp-proto`, `@opentelemetry/sdk-trace-base` [LS-PKG]. This is
  the cleanest place to do the tool-attribute mapping if it is needed (section 6.2).

## 3. Sharing traces with reviewers

- LangSmith: any trace can be shared publicly from the UI (Share in the Details view's more menu);
  "Shared traces can be viewed by anyone with the link, even without a LangSmith account"; viewers
  cannot edit; unshare from the trace toolbar or Settings > Shared URLs. The docs warn that the
  link is accessible to anyone who has it [LS-SHARE]. No SDK/API method is documented. Sharing a
  whole project is not documented.
- LangSmith membership: RBAC (Admin/Editor/Viewer/custom) is Enterprise-only; "Other plans default
  to using the `Admin` role for all users" [LS-USERS]. Pricing: Developer plan is $0 with 1 seat
  and 5k base traces/month; Plus is $39/seat with unlimited seats; base trace retention 14 days,
  extended 180 days [LS-PRICING]. So on the free plan a reviewer cannot be added as a member; the
  public share link is the realistic reviewer path, and links must be regenerated if the project
  is recreated. The 14-day base retention means traces should be produced (or re-produced) within
  two weeks of the review window, or upgraded to extended retention.
- Braintrust: access is through permission groups; Starter includes only the Owner group (full
  access), Viewer/Engineer groups need Pro ($249/month) [BT-ACCESS] [BT-PLANS]. No public trace
  link is documented; the SDK offers `permalink()` for a URL into the UI, which still requires
  access. Starter retention is 14 days [BT-PLANS].
- Vercel Agent Runs: team dashboard only; 30-day retention during beta; no sharing documented
  [VERCEL-AGENTRUNS] [EVE-AGENTRUNS].

## 4. Fallbacks

### 4.1 Braintrust (preferred fallback)

- Eve has a first-party integration: `eve add instrumentation/braintrust` creates
  `agent/instrumentation/braintrust.ts` exporting `braintrustEveInstrumentation({ metadata,
  setup: ({ agentName }) => initLogger({ projectName, apiKey: process.env.BRAINTRUST_API_KEY })
  })`. It uses Eve lifecycle events, not OTLP, so it needs no `@vercel/otel`; content follows the
  lifecycle-file `tracePolicy` semantics rather than `otel({ tracePolicy })` [EVE-BT] [EVE-INSTR].
  Braintrust documents what it captures: turn spans as traces (user message in, final response
  out, `eve.session_id` metadata), `eve.step` LLM spans with full message history and model
  response, tool spans with arguments and results, subagent spans, token usage, errors [BT-EVE].
  Requires `braintrust` >= 3.37.0 and Eve >= 0.62 [BT-EVE].
- Braintrust also ingests OTLP at `https://api.braintrust.dev/otel` (`/v1/traces` appended),
  headers `Authorization=Bearer <key>` and `x-bt-parent=project_id:<id>` (or `project_name:`),
  with a 10 MB per-request limit, and documents GenAI mapping including `gen_ai.input.messages`,
  `gen_ai.output.messages`, `gen_ai.operation.name` (`chat` -> `llm`, `execute_tool` -> `tool`),
  and `gen_ai.tool.name` [BT-OTEL] [BT-ATTRS] [BT-PAYLOAD]. Like LangSmith, its documented
  mapping does not list `gen_ai.tool.call.arguments/result`, so the native integration above is
  the better fallback, not Braintrust-over-OTLP.
- The Eve eval Braintrust reporter is separate (`Braintrust({ projectName })` in
  `evals.config.ts`, uploads experiments, stores `eveTraceIds`) and can be used regardless of
  where runtime traces go [EVE-EVALS-REPORTERS].

### 4.2 Vercel Agent Runs

Zero-config on Vercel deployments; useful for our own debugging and as a screenshot source, but
not as a reviewer-facing destination because nothing documents sharing outside the Vercel team
[VERCEL-AGENTRUNS] [EVE-AGENTRUNS].

## 5. Version pinning and preview caveats (Eve changelog)

- 0.62.0: `agent/instrumentation/` directory becomes the supported API; flat
  `instrumentation.ts` no longer discovered; `capture` option removed in favour of `tracePolicy`
  [EVE-CL-062].
- 0.67.0: instrumentation `setup` is awaited before server dependencies load so OTel can
  instrument packages such as `pg` [EVE-CL-067].
- 0.70.0: first local subagent turn joins the caller's trace; remote turns stay separate roots
  [EVE-CL-070].
- 0.72.0: tool calls become a single `execute_tool` span; `action.*` lifecycle handlers removed in
  favour of `tool.call.*`; token counts on model spans only under `gen_ai.usage.*` [EVE-CL-072].
- 0.74.0: offered tool definitions recorded on chat spans when input capture is enabled
  [EVE-CL-074].
- 0.76.0: `agent.action.parent_call_id` span attribute removed [EVE-CL-076].
- 0.79.0: Eve spans now come from the shared tracing library (`@vercel/agent-runs`); schema stays
  version 4 [EVE-CL-079].
- 0.79.1: explicit OTel trace policies enabling content are honoured for private/unknown
  audiences; `agent.input.messages.omitted` added; trace context propagated on AI Gateway
  requests [EVE-CL-0791].
- 0.80.0: dropped traces or excluded content directions now request Workflow data deletion at run
  end; `experimental.workflow.retention: "default"` opts out [EVE-CL-080].
- 0.80.1: tracing published as `@vercel/agent-runs` 0.0.1; Eve bundles it [EVE-CL-0801]
  [TRACING-PKG].

Implication: pin `eve` to a specific 0.80.x (currently 0.80.1) in `package.json`. The
instrumentation surface has had a breaking change roughly every few minor versions (0.62, 0.72,
0.76), and the attribute inventory in section 1.3 is from the 0.80.1 source. Eve is in public
preview [MAP-NOTES]; re-check section 1.3 if the pin moves.

## 6. Recommendation (what goes in the spec)

### 6.1 Primary: LangSmith over OTLP, explicit full content capture

Dependencies: `eve@0.80.1` (pinned), `@vercel/otel` (latest 2.x; 2.1.3 at time of writing), plus
the `@opentelemetry/*` peers `@vercel/otel` declares [VOTEL-PKG].

Env vars (Vercel project env for all environments, and `.env.local`):

```text
LANGSMITH_API_KEY=<workspace API key>
LANGSMITH_PROJECT=business-wiki-agent
LANGSMITH_ENDPOINT=https://api.smith.langchain.com      # optional; EU: https://eu.api.smith.langchain.com
```

Files:

```ts
// agent/instrumentation/otel.ts  -- process-wide ceiling: capture everything (synthetic data)
import { otel } from "eve/instrumentation/otel";

export default otel({
  resource: { "deployment.environment": process.env.VERCEL_ENV ?? "development" },
  tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }),
});
```

```ts
// agent/instrumentation/langsmith.ts  -- one OTLP destination
import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { otelIntegration } from "eve/instrumentation/otel";

const base = (process.env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com").replace(/\/$/, "");

export default otelIntegration({
  traceExporter: new OTLPHttpProtoTraceExporter({
    url: `${base}/otel/v1/traces`,
    headers: {
      "x-api-key": process.env.LANGSMITH_API_KEY!,
      "Langsmith-Project": process.env.LANGSMITH_PROJECT ?? "default",
    },
  }),
});
```

Why this shape: it is Eve's documented third-party pattern verbatim (Honeycomb/Arize)
[EVE-OTEL] [EVE-HONEY], uses LangSmith's documented endpoint and headers [LS-OTEL], and has no
hidden `LANGSMITH_TRACING` switch. The explicit `tracePolicy` is required because deployed web-chat
sessions are `unknown`/`private` audience and would otherwise export metadata only
[EVE-INSTR] [EVE-CHAN-EVE]. Keep Agent Runs enabled (no `agent-runs.ts` file) for our own
debugging.

Spec tasks that follow from this:

1. Smoke test on the first deploy: send one turn that calls at least one wiki tool; open the
   trace in LangSmith; check the three gates in 6.3.
2. Add a Vercel Settings -> Tracing 100 % rule if the project pre-exists `eve deploy`
   [EVE-AGENTRUNS].
3. Reviewer deliverable: 2-3 public share links (ingest, query with citation, lint) generated
   from the LangSmith UI [LS-SHARE], listed in the README, created within 14 days of submission
   or on extended retention [LS-PRICING].
4. Evals: keep the Eve Braintrust eval reporter optional; for trace links from eval runs, a
   custom reporter can log each session's `traceId` from `onSessionStart` next to the result
   [EVE-EVALS-REPORTERS].

### 6.2 Known gap and the cheap fix to try first

If tool runs show no inputs/outputs in LangSmith, swap the exporter for the LangSmith SDK one and
map Eve's attributes into fields LangSmith documents:

```ts
// agent/instrumentation/langsmith.ts  (variant)
import { LangSmithOTLPTraceExporter } from "langsmith/experimental/otel/exporter";
import { otelIntegration } from "eve/instrumentation/otel";

export default otelIntegration({
  traceExporter: new LangSmithOTLPTraceExporter({
    apiKey: process.env.LANGSMITH_API_KEY,
    projectName: process.env.LANGSMITH_PROJECT,
    transformExportedSpan: (span) => {
      const a = span.attributes;
      if (a["gen_ai.operation.name"] === "execute_tool") {
        a["langsmith.span.kind"] = "tool";
        if (a["gen_ai.tool.call.arguments"] !== undefined) a["input.value"] = a["gen_ai.tool.call.arguments"];
        if (a["gen_ai.tool.call.result"] !== undefined) a["output.value"] = a["gen_ai.tool.call.result"];
      } else if (a["gen_ai.operation.name"] === "invoke_agent" || a["gen_ai.operation.name"] === "workflow") {
        a["langsmith.span.kind"] = "chain";
      }
      return span;
    },
  }),
});
```

This relies on documented behaviour only: `transformExportedSpan` exists for "add or remove
attributes from the span" [LS-EXPORTER]; `input.value`/`output.value` map to `inputs`/`outputs`
and `langsmith.span.kind` sets run type [LS-OTEL]. It adds `langsmith` and
`@opentelemetry/exporter-trace-otlp-proto` + `@opentelemetry/sdk-trace-base` to dependencies
[LS-PKG] and requires `LANGSMITH_TRACING=true` in the env, or exports silently do nothing
[LS-EXPORTER] [LS-ENV]. Eve's `otelIntegration` accepts it because the exporter type is
structural [EVE-OTELCONF].

### 6.3 Fallback trigger

Run the smoke test after the first deploy with the 6.1 config. Gates, in a LangSmith trace view:

1. Tree: one root run per turn with `agent.step` -> `chat ...` and `execute_tool ...` children
   (nothing dropped for missing parents) [LS-OTEL].
2. Model run: `inputs.messages`/`outputs.messages` render as a conversation and
   `usage_metadata` shows tokens.
3. Tool run: name, arguments, and result are readable.

If gate 3 fails, apply 6.2 (budget: 2 hours). If gate 1 or 2 fails, or gate 3 still fails after
6.2, switch to Braintrust: `eve add instrumentation/braintrust`, set `BRAINTRUST_API_KEY`,
`braintrust` >= 3.37.0, and delete `agent/instrumentation/langsmith.ts` [EVE-BT] [BT-EVE].
Braintrust's integration is documented to capture exactly the turn/step/tool inputs and outputs we
need [BT-EVE]. Reviewer access then means either inviting them as Owners (Starter has only the
Owner group) or relying on screenshots/recording, since no public link is documented
[BT-ACCESS] [BT-PLANS]. Total time-box for the LangSmith path before falling back: half a day.

## 7. Open items not settled by primary sources

- How LangSmith renders `gen_ai.input.messages` in the GenAI `parts` schema (as opposed to
  `{role, content}` objects); the docs only say "Array of input messages" [LS-OTEL]. Gate 2 covers
  it.
- The run type LangSmith assigns when `gen_ai.operation.name` is `invoke_agent` or `workflow`
  and no `langsmith.span.kind` is present; not documented [LS-OTEL]. Cosmetic; 6.2 sets `chain`.
- Whether AI SDK `ai.*` child spans are exported alongside Eve's `chat` spans on 0.80.x
  [EVE-CONTENTPOLICY]; if they are, LangSmith's SDK exporter would map them too [LS-EXPORTER].
- Whether a `Langsmith-Project` header naming a non-existent project auto-creates it; not
  documented [LS-OTEL]. Create the project in the UI first.

## Sources

Eve docs (fetched as `.md`, 2026-10-17):

- [EVE-INSTR] https://eve.dev/docs/observability/instrumentation.md
- [EVE-OTEL] https://eve.dev/docs/observability/otel.md
- [EVE-AGENTRUNS] https://eve.dev/docs/observability/agent-runs.md
- [EVE-MIG] https://eve.dev/docs/observability/instrumentation-migration.md
- [EVE-TUI] https://eve.dev/docs/guides/dev-tui.md
- [EVE-DEPLOY] https://eve.dev/docs/guides/deployment/vercel.md
- [EVE-HOOKS] https://eve.dev/docs/guides/hooks.md (hooks are not a trace surface; the page points to `otel#add-runtime-context` for typed channel metadata)
- [EVE-CHAN-EVE] https://eve.dev/docs/channels/eve.md (Audience section)
- [EVE-CHAN-OVERVIEW] https://eve.dev/docs/channels/overview.md (Audience section)
- [EVE-EVALS-TARGETS] https://eve.dev/docs/evals/targets.md
- [EVE-EVALS-REPORTERS] https://eve.dev/docs/evals/reporters.md
- [EVE-INTEG] https://eve.dev/integrations.md
- [EVE-BT] https://eve.dev/integrations/braintrust.md
- [EVE-HONEY] https://eve.dev/integrations/honeycomb-instrumentation.md
- [EVE-ARIZE] https://eve.dev/integrations/arize.md
- Changelog https://eve.dev/changelog.md and `/changelog/page/N.md`: [EVE-CL-0801] v0.80.1, [EVE-CL-080] v0.80.0, [EVE-CL-0791] v0.79.1, [EVE-CL-079] v0.79.0, [EVE-CL-076] v0.76.0, [EVE-CL-0751] v0.75.1, [EVE-CL-074] v0.74.0, [EVE-CL-072] v0.72.0, [EVE-CL-070] v0.70.0, [EVE-CL-067] v0.67.0, [EVE-CL-062] v0.62.0

Eve source, https://github.com/vercel/eve at commit `6210b1d7a829a0ade0223e8d47d425b0cb8407ea`:

- [EVE-PKG] `packages/eve/package.json` (version 0.80.1; optional peer `@opentelemetry/api`)
- [TRACING-PKG] `packages/tracing/package.json` (`@vercel/agent-runs` 0.0.1)
- [EVE-SPANKINDS] `packages/tracing/src/core/span-kinds.ts`
- [EVE-CONTENTPOLICY] `packages/tracing/src/core/content-policy.ts`
- [EVE-SERIAL] `packages/tracing/src/adapters/serialization.ts` (`CONTENT_ATTRIBUTE_LIMIT = 32 * 1024`)
- [EVE-OTELDECL] `packages/eve/src/tracing/eve/otel-declaration.ts`
- [EVE-OTELCONF] `packages/eve/src/tracing/eve/otel-configuration.ts`
- [EVE-PUBOTEL] `packages/eve/src/public/instrumentation/otel.ts`
- [EVE-PROVIDERS] `packages/eve/src/instrumentation/providers.ts` (`seedInstrumentationProviders`)
- [EVE-DEVENV] `packages/eve/src/internal/application/dev-environment.ts` (`resolveInstrumentationEnvironment`)

`@vercel/otel`, https://github.com/vercel/otel `main`:

- [VOTEL-PKG] `packages/otel/package.json` (2.1.3; peer deps)
- [VOTEL-PROTO] `packages/otel/src/exporters/exporter-trace-otlp-proto-fetch.ts`
- [VOTEL-CONFIG] `packages/otel/src/exporters/config.ts`
- [VOTEL-TRACECFG] `packages/otel/src/exporters/trace-config.ts`

LangSmith:

- [LS-OTEL] https://docs.langchain.com/langsmith/trace-with-opentelemetry (fetched as `.md`)
- [LS-RUNTYPES] https://docs.langchain.com/langsmith/run-data-format (Run types)
- [LS-SHARE] https://docs.langchain.com/langsmith/share-trace
- [LS-USERS] https://docs.langchain.com/langsmith/user-management
- [LS-AISDK] https://docs.langchain.com/langsmith/trace-with-vercel-ai-sdk
- [LS-PRICING] https://www.langchain.com/pricing-langsmith
- [LS-PKG] https://github.com/langchain-ai/langsmith-sdk `js/package.json` (0.10.9)
- [LS-EXPORTER] https://github.com/langchain-ai/langsmith-sdk `js/src/experimental/otel/exporter.ts`
- [LS-ENV] https://github.com/langchain-ai/langsmith-sdk `js/src/env.ts` (`isEnvTracingEnabled`)

Braintrust:

- [BT-EVE] https://www.braintrust.dev/docs/integrations/agent-frameworks/eve
- [BT-OTEL] https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry
- [BT-ATTRS] https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry/attributes
- [BT-PAYLOAD] https://www.braintrust.dev/docs/kb/otlp-traces-endpoint-payload-limits
- [BT-ACCESS] https://www.braintrust.dev/docs/guides/access-control
- [BT-PLANS] https://www.braintrust.dev/docs/reference/limits

Vercel:

- [VERCEL-AGENTRUNS] https://vercel.com/docs/eve/agent-runs

Project:

- [MAP-NOTES] issue #1 Notes ("Vercel Eve ... public preview")
