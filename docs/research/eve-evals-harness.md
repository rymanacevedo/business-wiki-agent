# Eve eval harness mechanics: datasets, judge, tool stubs, reporters

Resolves issue #4. Researched 2026-10-17 against eve **v0.80.1** (the `version` in
`packages/eve/package.json` on `vercel/eve@main`). Eve is in public preview and the
evals API has had breaking changes in most minor releases (see
[Preview caveats](#7-preview-caveats-breaking-changes-in-the-changelog)); pin the
version in `package.json`.

## Sources

Every claim below cites one of these. Docs were fetched as their `.md` variants; source
files come from the `vercel/eve` tree on `main`.

| Key | Source |
| --- | --- |
| [overview] | https://eve.dev/docs/evals/overview.md |
| [cases] | https://eve.dev/docs/evals/cases.md |
| [assertions] | https://eve.dev/docs/evals/assertions.md |
| [judge] | https://eve.dev/docs/evals/judge.md |
| [targets] | https://eve.dev/docs/evals/targets.md |
| [reporters] | https://eve.dev/docs/evals/reporters.md |
| [running] | https://eve.dev/docs/evals/running.md |
| [stubs] | https://eve.dev/docs/evals/tool-stubs.md |
| [client] | https://eve.dev/docs/guides/client/overview.md |
| [cli] | https://eve.dev/docs/reference/cli.md |
| [auth] | https://eve.dev/docs/guides/auth-and-route-protection.md |
| [decide] | https://eve.dev/docs/guides/decide.md |
| [ai-sdk] | https://ai-sdk.dev/docs/ai-sdk-core/decisions |
| [changelog] | https://eve.dev/changelog.md and `/changelog/page/2.md` through `/page/12.md` (v0.52.5 to v0.80.1) |
| [src:define-eval] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/define-eval.ts |
| [src:types] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/types.ts |
| [src:discover] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/discover.ts |
| [src:filter] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/cli/filter.ts |
| [src:cli] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/cli/eval.ts |
| [src:run] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/run-evals.ts |
| [src:verdict] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/verdict.ts |
| [src:artifacts] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/artifacts.ts |
| [src:reporter-types] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/reporters/types.ts |
| [src:reporters-index] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/reporters/index.ts |
| [src:braintrust] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/reporters/braintrust.ts |
| [src:junit] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/reporters/junit.ts |
| [src:expect] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/expect/index.ts |
| [src:judge] | https://github.com/vercel/eve/blob/main/packages/eve/src/evals/judge.ts |
| [src:stub-fixture] | https://github.com/vercel/eve/blob/main/e2e/fixtures/agent-tool-stubs/agent/channels/eve.ts |

## TL;DR for the implementing agent

- One `evals/` directory at the app root, exactly one `evals/evals.config.ts`, cases in `*.eval.ts`; the file path is the eval id, and directories are the grouping (therefore the slicing) mechanism. [overview][src:discover]
- Datasets: a file default-exports an array of `defineEval(...)`; ids become `<file>/0000`, `<file>/0001`. Rows load with `loadJson`/`loadYaml` from `eve/evals/loaders`, relative to the app root. [cases]
- Deterministic checks: scoped assertions on `t`/`turn`/`session` (`succeeded`, `calledTool`, `notCalledTool`, `toolOrder`, `usedNoTools`, `maxToolCalls`, `noFailedActions`, `eventOrder`, ...) plus `t.check(value, matcher)` with exactly five matchers in `eve/evals/expect`: `includes`, `equals`, `matches`, `similarity`, `satisfies`. [assertions][src:expect]
- Judge: `t.judge(criteria | question | batch, { on?, model? })`, scored 0-1, soft by default, graded by a *decision model* (default `typesafe-ai/jev` via AI Gateway). The judge never touches the agent model. [judge]
- Tool stubs: `t.session({ stubs: [...] })` replaces tool executions with JSON outcomes or thrown errors, first-match-wins, with per-session sequences. **Denied by default, including locally**: the agent's `agent/channels/eve.ts` must return `allowToolStubs: true`. [stubs][auth][src:stub-fixture]
- Reporters: Console (default), `--junit`, `Braintrust(...)`, `Datadog(...)`, and the `EvalReporter` interface for custom ones. Every run also writes `.eve/evals/<timestamp>/{summary.json,results.jsonl,evals/<id>.json,evals/<id>.events.ndjson}` unconditionally. [reporters][running][src:artifacts]
- Targets: the same files run against the local dev server (`eve eval`) or a deployment (`eve eval --url ...`); the summary records `target.kind`. [targets][src:types]
- Gaps that need our own code: before/after diff table, per-slice aggregation (artifacts omit `tags`/`metadata`), judge-vs-human calibration, repeated runs, per-eval wiki state isolation, and any LangSmith export of results (traces go to LangSmith via OpenTelemetry; eval results do not). See [Gaps](#gaps-that-force-a-custom-script).

---

## 1. Cases

### Discovery, identity, and the required config

> eve discovers evals under the app-root `evals/` directory, in `.eval.ts` files. Each file is one eval by default. A file can also default-export an array to fan out over a dataset (see Cases). The file path is the eval's identity, so you don't author an `id` or `name`. Directories group related evals (`evals/weather/brooklyn-forecast.eval.ts` becomes id `weather/brooklyn-forecast`). [overview]

> Every `evals/` directory needs exactly one `evals.config.ts` at its root. [overview]

`defineEval` throws if you pass `id` or `name`, and rejects the legacy keys `input`,
`run`, `checks`, `scores`, `expected`, `thresholds`, `parseOutput`, `model`,
`modelOptions`, `cases`, `requires`, each with a migration hint. [src:define-eval]

The accepted fields, verbatim from the type: [src:types]

```ts
interface EveEvalBase {
  readonly description?: string;
  readonly judge?: EveEvalJudgeConfig;
  readonly timeoutMs?: number;
  /** Used by `--tag` filtering. */
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly reporters?: readonly EvalReporter[];
}
export interface EveEvalInput<TContext = unknown> extends EveEvalBase {
  test(t: EveEvalContext<TContext>): void | Promise<void>;
}
```

Eval files placed under `agent/` are detected and reported as an error ("eve eval only
scans the top-level evals/ directory"). [src:cli] The runner loads the app's development
environment files before discovery, so `.env.local` credentials apply. [src:cli]

### Dataset fan-out (default-exporting an array)

> To fan one file out over a dataset, default-export an array of `defineEval(...)` values. Eval modules are ESM, so top-level `await` can load anything. Ids derive from the file name plus a zero-padded index in array order (`sql/0000`, `sql/0001`, and so on). The loaders (`loadJson`, `loadYaml` from `eve/evals/loaders`) parse fixture files relative to the app root. [cases]

```ts
// evals/sql.eval.ts
import { defineEval } from "eve/evals";
import { loadYaml } from "eve/evals/loaders";
import { equals } from "eve/evals/expect";

const doc = await loadYaml("evals/data/cases.yaml");
const rows = doc.evals as readonly { task: string; prompt: string; sql: string }[];

export default rows.map((row) =>
  defineEval({
    description: row.task,
    async test(t) {
      const turn = await t.send(row.prompt);
      t.succeeded();
      t.check(turn.message, equals(row.sql));
    },
  }),
);
```
[cases]

Index padding is four digits; a duplicate id (an array-exported `weather.eval.ts` plus
`weather/0000.eval.ts`) is a discovery error. [src:discover]

### Fixture location

> keep dataset fixtures in `evals/data/` [overview]

> Shared constants and helpers live in sibling non-eval files (any name that doesn't end in `.eval.ts`) [cases]

> The loaders are meant for fixtures, not runtime agent code. [cases]

### Per-case metadata and tags for slicing

- `tags` drive `eve eval --tag <t...>` / `--exclude-tag <t...>`: an eval runs when it carries at least one included tag (or no include filter is given) and none of the excluded tags. A `--tag` that matches nothing exits `2`; `--exclude-tag` removing everything exits `0` with nothing run. [running][src:filter][src:cli]
- `eve eval --list --json` prints `{ id, description, tags }` per selected eval. [src:cli]
- Positional ids match exactly or by directory prefix, and a directory prefix also selects every entry of an array-exported file (`eve eval weather` runs `weather/0000`, ...). [running][src:discover]
- Where tags/metadata go: the Braintrust reporter spreads `evaluation.metadata` into each row's metadata and sends `evaluation.tags` as row tags and experiment tags; Datadog reads `metadata.expectedOutput | expected | expected_output` as the expected output. [src:braintrust][reporters]
- Where they do **not** go: the `.eve/evals/` artifacts (`summary.json`, `results.jsonl`, per-eval JSON) carry `id`, `verdict`, `status`, `assertions`, `error`, `skipReason`, `traceContexts`, `output`, `derived`, and so on, but not the eval's `tags`, `metadata`, or `description`. [src:artifacts] A custom reporter receives the eval definition in `onEvalComplete(result, context)` via `context.evaluation`. [src:reporter-types][src:run]

Implication: slicing from artifacts alone must derive the slice from the id's directory
prefix; richer slices need a custom reporter (see
[Gaps](#gaps-that-force-a-custom-script)).

### Single-turn and multi-turn scripts

> `t.send(message, options?)` creates a new session with its first message in one request and waits for the turn to settle. The returned turn carries `.session`, `.message`, and `.expectOk()`. [cases]

> `session.send(message, options?)` sends a follow-up on that session and waits for it to settle. [cases]

```ts
// evals/session-continuity.eval.ts
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

export default defineEval({
  async test(t) {
    const first = await t.send("My favorite word is marigold.");

    const second = await first.session.send("What is my favorite word?");
    await t.require(second.sessionId, equals(first.sessionId));

    t.succeeded();
    second.messageIncludes("marigold");

    t.judge("The assistant remembers the user's favorite word across turns", {
      on: first.session.transcript,
    }).atLeast(0.8);
  },
});
```
[cases]

Other drive-API facts relevant to this project: [cases]

- `t.session(options?)` creates an empty session (this is where `stubs` go); `session.start(message)` returns a live turn with `waitForEvent`, `cancel`, `result`.
- `session.sendFile(text, path, mediaType?)` attaches a local file as a data URL (useful for receipt/document ingest cases).
- `session.requireInputRequest(filter?)`, `session.respond(responses)`, `session.respondAll(optionId)` drive HITL approval gates; `t.parked()` asserts a clean park on unanswered HITL input. [assertions]
- `session.transcript` is `User:` / `Assistant:` text only: "It excludes reasoning, tool calls, tool results, and messages from other sessions."
- Each turn exposes `.message`, `.data`, `.events`, `.inputRequests`, `.toolCalls`, `.session`, `.sessionId`, `.status`, `.expectOk()`.
- `t.skip(reason)` first thing in the body marks the eval skipped (not pass/fail, exit code unaffected). `t.log(message)` writes into the artifact; `--verbose` streams it.

### Run-wide setup/teardown and typed context

`defineEvalConfig({ setup, teardown, judge, reporters, maxConcurrency, timeoutMs })`;
`setup` runs once before target startup and its return value is `t.context` (typed with
`defineEval<typeof config>`); teardown runs after shutdown even on failure. Concurrent
evals share the context, so "isolate any database records they modify".
[overview][src:types]

### Deterministic fixture models

`mockModel("reply")` / `mockModel(({ lastUserMessage, toolResults }) => ...)` from
`eve/evals` replaces the agent's model inside a fixture agent definition; it is for
exercising eve's runtime without a provider, not for grading our real agent. [overview]

---

## 2. Assertions

### Scoped assertions (run, session, or turn)

Verbatim table from the docs: [assertions]

| Assertion | Asserts |
| --- | --- |
| `t.succeeded()` | The run did not fail and did not park on unanswered HITL input |
| `t.parked()` | The run cleanly parked on HITL input |
| `t.messageIncludes(token)` | Joined assistant text contains `token` (string or RegExp) |
| `turn.outputEquals(value)` / `.outputMatches(schema)` | Deep equality or Standard Schema validation of turn/session structured output |
| `t.calledTool(name, opts?)` | A matching tool call completed (`input`, `output`, `status`, `count`) |
| `t.loadedSkill(skill, opts?)` | A load of `skill` completed (`output`, `status`, `count`) |
| `t.notCalledTool(name)` | No request for `name` in any lifecycle state |
| `t.toolOrder([...names])` | Tool requests appear in order |
| `t.usedNoTools()` | No tool calls at all; skill loads don't count |
| `t.maxToolCalls(n)` | At most `n` tool calls; skill loads don't count |
| `t.noFailedActions()` | No tool, subagent, or skill action reported a failure |
| `t.calledSubagent(name, opts?)` | A subagent delegation happened (identity, remote, output, status, count) |
| `t.event(type, opts?)` / `t.notEvent(type, opts?)` | Typed event presence, data, and count matching |
| `t.eventOrder([...matchers])` | Matching event groups occur in order |
| `t.eventsSatisfy(label, predicate)` | Escape hatch: any predicate over the typed event stream |

> `t.calledTool` and `t.usedNoTools` are mutually exclusive; assert one or the other, never both in the same run. [assertions]

### Trajectory assertions: order, arguments, not-called

The matcher mini-language: [assertions]

> Tools accept `{ input, output, status, count }` ... Calls match `status: "completed"` by default. Tool lifecycle checks also accept `"pending"`, `"failed"`, and `"rejected"`. ... A numeric `count` requires an exact number of calls matching every supplied constraint. Use a predicate for ranges ... Matcher values accept a literal (objects partial-deep-match), a RegExp, or a predicate function that returns a boolean

```ts
t.calledTool("bash", { input: { command: /^pwd/ }, count: 1 });
t.calledTool("echo", { count: (count) => count >= 2 });
t.calledTool("echo", { output: (value) => String(value).includes(marker) });
parked.calledTool("guarded", { status: "pending", count: 1 });
t.calledTool("guarded", { output: /approved/, count: 1 });
```
[assertions]

Order comes from `t.toolOrder(["complete_task", "list_tasks"])` (also on `turn`), and
typed-event ordering from `turn.eventOrder([{ type, data, count }, ...])`.
[assertions][stubs] `turn.requireToolCall("search")` returns the call for dependent
code. [assertions]

Caveats: calls through `eve__tool` are reported under the entry they reach; the tool-name
helpers *throw* for `eve__tool`, `eve__skill`, and retired names (`load_skill`,
`task_wait`, `task_cancel`, `final_output`, ...) unless the root agent declares such a
tool. [assertions][changelog v0.76.0]

### Value assertions: the full `eve/evals/expect` list

The module exports exactly five builders (plus types). [src:expect]

| Builder | Scores | Default |
| --- | --- | --- |
| `includes(value)` | coerced string contains a substring or matches a RegExp | gate |
| `equals(value)` | deep structural equality | gate |
| `matches(schema)` | validates against a Standard Schema | gate |
| `similarity(expected)` | normalized Levenshtein similarity, 1 = identical | soft |
| `satisfies(fn, label)` | custom boolean predicate | gate |

[assertions]

```ts
import { includes, equals, matches, satisfies, similarity } from "eve/evals/expect";

t.check(turn.message, includes(/sunny/i)); // substring or RegExp (gate)
t.check(parsed, equals({ city: "Brooklyn" })); // deep structural equality (gate)
t.check(parsed, matches(WeatherSchema)); // Standard Schema, e.g. Zod (gate)
t.check(turn.message, similarity("Sunny, 72F")); // fuzzy 0–1 Levenshtein (soft)
```
[assertions]

### Computed scores: `t.score`

> `t.score(evaluation)` records a score from 0 to 1. The evaluation is the number or `{ score, message?, metadata? }`, or a promise of either. Chain `.label(key)` to name it ... On its own a score has no verdict ... Chain a rule when it should [assertions]

```ts
t.score(gradeFaithfulness(reply, reference)).label("faithfulness").gate(0.9); // fails below 0.9
t.score(brevity).label("reply-brevity").atLeast(0.5); // marks the eval `scored`, fatal under --strict
```
[assertions]

This is the hook for any deterministic metric we compute ourselves (citation-link
validity, index-first ordering, wiki-diff size) and for recording a human label alongside
a judge score.

### Gates vs soft, `--strict`, verdicts

> **Gates** are hard. A failed gate marks the eval `failed` and `eve eval` exits non-zero. Run-level methods, `includes`, `equals`, and `matches` are gates by default.
> **Soft** assertions are tracked data. ... a below-threshold soft assertion marks the eval `scored` (visible but not fatal, unless you pass `--strict`). `similarity`, every `t.judge(...)` assertion, and every `t.score(...)` are soft by default. A soft assertion with no threshold records no verdict and never fails. [overview]

Chainable handle (verbatim type): `gate(threshold?)`, `soft(threshold?)`,
`atLeast(threshold)`, `label(label)`. [src:types]

Verdict algorithm: execution error means `failed`; any `passed === false` gate means
`failed`; any `passed === false` soft means `scored`; `t.skip` means `skipped`; otherwise
`passed`. [src:verdict] Exit codes: `0` when all gates (and soft thresholds under
`--strict`) pass; `1` on any failure or strict miss; `2` on configuration error.
[running][src:cli]

`await t.require(value, assertion)` records a gate and stops the body if it fails.
[assertions]

---

## 3. Judge

### Rubric shapes

`t.judge` accepts a criteria string, one typed question, or a batch. [judge] Question
types, verbatim from the source: [src:types]

```ts
export type JudgeQuestion =
  | { readonly type: "boolean"; readonly instructions: JudgeInput;
      readonly criteria?: { readonly true?: JudgeInput | null; readonly false?: JudgeInput | null }; }
  | { readonly type: "score"; readonly instructions: JudgeInput;
      readonly criteria: readonly (JudgeInput | null)[]; }
  | { readonly type: "choice"; readonly instructions: JudgeInput;
      readonly criteria: Readonly<Record<string, JudgeInput | null>>; readonly expected: string; };
export type JudgeInput = string | JsonObject | readonly JsonValue[];
```

Score scale (0-1 for every type): [judge][src:judge]

| Question | Assertion score |
| --- | --- |
| Criteria string or `boolean` | The returned probability of true, from 0 to 1 |
| `score` | The returned rubric position divided by the highest level index |
| `choice` | 1 when the selected option equals `expected`; otherwise 0 |

> Boolean scores are model estimates, not guaranteed calibrated confidence. A rubric needs at least two levels, ordered from worst to best. [judge]

```ts
t.judge({
  type: "score",
  instructions: "Grade the response's clarity.",
  criteria: ["Unclear", "Mostly clear", "Clear and concise"],
})
  .label("clarity")
  .atLeast(0.75);
```
[judge]

Batch (one request, shared `state`, one handle per question): [judge]

```ts
const judgments = t.judge({
  state: { response: turn.message ?? "", reference },
  questions: {
    accurate: { type: "boolean", instructions: "Is the response consistent with the reference?" },
    outcome: {
      type: "choice",
      instructions: "Classify the response.",
      criteria: { answered: "Answers the request", declined: "Declines the request" },
      expected: "answered",
    },
  },
});
judgments.accurate.atLeast(0.9);
judgments.outcome.gate();
```

Choice `expected` is used locally for scoring; "it does not send it to the decider".
[judge]

### Grading a message vs a transcript

> By default, the decider receives `{ input, output }`: the latest prompt and assistant message from the session whose turn most recently settled. ... Pass `on` to replace the output. JSON values stay structured ... For a multi-turn eval, pass `session.transcript` [judge]

Batch calls use `state` (replacing `{ input, output }` entirely) instead of `on`. [judge]
Because the transcript excludes tool calls and results [cases], a judge that must see the
trajectory ("did it read the index before answering?") should receive `turn.toolCalls` or
`derived` facts as JSON in `state`, or be replaced by `t.toolOrder`.

### Thresholds and timing

> Judges are soft by default ... `.atLeast(threshold)` sets a soft bar ... `.gate(threshold)` makes a lower score fail the eval outright. An omitted gate threshold is 1. [judge]

> Calls capture their state and questions and start immediately. The runner waits for them during finalization; handles are not awaitable. [judge]

The body therefore cannot read a judge's score to branch or to compute agreement inline
(see calibration below). Judge failures (missing credentials, invalid answers, provider
errors) "become failed gates even for tracked-only judgments". [judge]

### Judge model configuration and using a different family than the agent

Resolution order: per-call `{ model, modelOptions }`, then per-eval `judge`, then config
`judge`, then `decide`'s default `typesafe-ai/jev`. [judge]

> String IDs resolve through the AI SDK default provider, or Vercel AI Gateway when none is configured. Gateway uses `AI_GATEWAY_API_KEY` or Vercel OIDC credentials ... Gateway accepts native decision models such as `typesafe-ai/jev`; passing a language model ID such as `openai/gpt-6-luna` does not automatically select the OpenAI adapter. Use a decision-model instance as shown above for language models. [judge]

```ts
import { openai } from "@ai-sdk/openai";

t.judge("The response addresses the request.", {
  model: openai.decisionModel("gpt-6-luna"),
  modelOptions: { providerOptions: { openai: { reasoningEffort: "high" } } },
});
```
[judge]

The AI SDK lists `decisionModel` factories for `typeSafeAi`, `openai`, `anthropic`,
`google`, `perplexity`; TypeSafe AI, OpenAI, and Perplexity are native deciders, while
"Anthropic and Google adapt structured language-model output for all three types".
[ai-sdk]

For this project's standing decision (Claude Sonnet as agent, one AI Gateway credential,
different family as judge), the two options supported by primary sources are:

1. **Default `typesafe-ai/jev` through Gateway.** Zero extra config, same
   `AI_GATEWAY_API_KEY`, and it is a non-Anthropic decision model, so the "different
   family" requirement is met with one credential. [judge][decide]
2. **A provider decision-model instance** (`openai.decisionModel(...)`,
   `google.decisionModel(...)`), which "uses that provider's credentials" [judge], i.e. a
   second key. Nothing in the docs says a Gateway-routed *language* model id can act as a
   decision model, so treat that as unsupported.

Recommendation: option 1, with the judge pinned in `evals.config.ts` so every judge
assertion's `metadata.judge` (the model id recorded on each result [src:judge]) is stable
across the before and after runs.

### Report names and captured diagnostics

Assertion names are `judge.boolean`, `judge.score`, `judge.choice`, plus `.<key>` for
batch entries. [judge][src:judge] Each judge assertion's `metadata` records `judge` (model
id), `questionId`, `question`, `state`, `answer`, `score`, `usage`, `usageScope`,
`warnings`, `rounding`, `providerMetadata`, `response`. [src:judge] That metadata is
written to `summary.json` and `results.jsonl`. [src:artifacts]

### Calibration against human labels

Eve has **no native calibration feature**; nothing in [judge], [reporters], or the source
computes agreement. What the harness does give us:

- Dataset rows can carry `humanLabel` and go into `metadata` on each `defineEval` (reaches Braintrust metadata and custom reporters, not artifacts). [src:braintrust][src:reporter-types]
- The judge's raw `answer` (probability / rubric position / choice) and normalized `score` are in each assertion's `metadata` in `results.jsonl`. [src:judge][src:artifacts]
- `t.score({ score: humanLabel, metadata: { source: "human" } }).label("human-<key>")` records the human label as a sibling assertion in the same result, so one `results.jsonl` line holds both numbers. [assertions]

Recipe (custom script, see [Gaps](#gaps-that-force-a-custom-script)): for each judged
key, join judge score and human label by eval id, then compute agreement at the chosen
threshold (and sweep thresholds), plus a confusion matrix or Cohen's kappa. Feed the
chosen threshold back into `.atLeast(...)`. The docs explicitly advise this review:
"Scores now represent a probability rather than a binary yes/no answer, so review
thresholds against your examples." [judge]

---

## 4. Tool stubs

### API

> Pass `stubs` when creating an eval session to replace selected tool executions with JSON responses. The same rules work against local and deployed agents [stubs]

```ts
const session = await t.session({
  stubs: [
    { id: "tasks", tool: "list_tasks",
      outcomes: [{ response: { tasks: [{ id: "milk", title: "Buy milk" }] } },
                 { response: { tasks: [] } }] },
    { id: "complete-milk", tool: "complete_task",
      match: { task_id: { const: "milk" } },
      outcome: { response: { success: true } } },
  ],
});
```
(abridged from [stubs])

| Field | Meaning |
| --- | --- |
| `id` | Your session-unique rule identifier. ... It is neither a tool name nor a tool-call ID. |
| `tool` | The existing tool's name, optionally qualified by its local subagent path. |
| `match` | Optional input-property constraints, expressed as JSON Schema. Omit it or use `{}` to match any valid input. |
| `outcome` | One outcome repeated on every matching call |
| `outcomes` | A nonempty array of outcomes returned in sequence. Use exactly one of `outcome` or `outcomes`. |

[stubs]

Rules: [stubs]

- "Rules are evaluated from top to bottom. The first matching stub wins." "If no rule matches, eve executes the real tool."
- `outcome` repeats; `outcomes` advances per matching call then repeats its last entry; "Later turns continue the same sequence"; parallel calls consume in arrival order.
- `match` is a reference-free JSON Schema 2020-12 subset (types, scalar `const`/`enum`, string pattern/bounds, numeric bounds, array items/contains, object properties/required/additionalProperties, logical/conditional). Unsupported constraints fail setup.
- Error injection: `{ throw: { name?: "TimeoutError", message: "..." } }`; assert with `turn.calledTool("list_tasks", { status: "failed", count: 1 })`. `noFailedActions()` still rejects it.
- Unused rule ids are warnings; unknown static tool names fail session creation; limits are 100 rules, 20,000 JSON nodes, depth 32.
- Subagents: `researcher/list_tasks` replaces only that subagent's tool; `researcher` alone replaces the whole delegation.
- Stubs "retain the real tool's input schema, approvals, and output processing" and cannot register a new tool; `eve__search`/`eve__tool`/`eve__skill` and provider-hosted tools cannot be stubbed.
- Known artifact: stubbed ordinary tools may emit an extra `action.partial` (tracked as AX-5164); assert on `action.result`.

`ToolStub` and `ToolStubOutcome` types are exported from both `eve/evals` and
`eve/client`; share fixtures as `satisfies readonly ToolStub[]`. [stubs]

### Permission (the part that bites)

> Tool replacement is denied by default, including in development. [stubs]

> Creating a stubbed eval session requires an explicit `allowToolStubs: true` in the verified route authentication result. The target's server configuration grants permission; request JSON cannot. [auth]

Local development example from the docs: [auth]

```ts
// agent/channels/eve.ts
import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

const authenticate = localDev();
export default eveChannel({
  auth: async (request) => {
    const caller = await authenticate(request);
    return caller ? { ...caller, allowToolStubs: true } : null;
  },
});
```

Eve's own e2e fixture grants it for both `vercelOidc()` and `localDev()` with the comment
"This isolated fixture has no production tools or data." [src:stub-fixture] For a deployed
target, the grant goes on the OIDC `subjects` entry for the eval runner project. [stubs]

### How this project should use stubs

- **Query slice**: stub `read_page`/`search_wiki` (our tools) with a fixed wiki snapshot so the citation and index-first checks grade retrieval behaviour, not whatever the last ingest left behind.
- **Ingest slice**: stub the *write* tools (`write_page`, `append_log`) with `{ response: { ok: true } }` and assert the requested `input` (`t.calledTool("write_page", { input: { path: /^entities\// } })`). The docs are explicit that stubs "describe a sequence, not a simulated task database" and that "testing a real database update requires the real tool" [stubs], so keep one or two un-stubbed end-to-end ingest cases.
- **Lint slice**: stub reads with contradictory or stale fixture pages; inject `throw` to test graceful failure.
- **Safety slice**: stub `read_page` to return a document containing prompt injection, then `t.notCalledTool("write_page")` or `t.parked()` on the approval gate.

---

## 5. Reporters and artifacts

### What `eve eval` writes locally (always)

> Each run drops artifacts under `.eve/evals/<timestamp>/`: a run `summary.json`, a `results.jsonl` index, and per-eval assertion results, verdicts, captured event streams, and `t.log` lines under `evals/`. [running]

From the writer: [src:artifacts]

- `summary.json`: `target`, `startedAt`, `completedAt`, `passed`, `failed`, `scored`, `skipped`, `errored`, `totalEvals`, `evals[]` with `id`, `verdict`, `status`, `assertions[] { name, key, score, severity, threshold, passed, errored, message, metadata }`, `error`, `skipReason`, `traceContexts`.
- `results.jsonl`: one line per eval with `id`, `verdict`, `status`, `output`, `assertions`, `error`, `skipReason`, `traceContexts`.
- `evals/<id>.json`: adds `result.finalMessage`, `sessionId`, `logs`, `derived` (tool calls, counts, `models`, `usage` tokens/cost), `runtimeIdentity`, `sessions`.
- `evals/<id>.events.ndjson`: the full captured event stream.

Artifacts are written inside `runEvals` before `onRunComplete`, regardless of
`--skip-report`. [src:run] `--json` prints the whole `EveEvalRunSummary` (including
`results[].result.events`) to stdout and suppresses the console reporter. [src:cli]
`--verbose` prints each session's `wrun_...` workflow run id. [running]

### Built-in reporters

`eve/evals/reporters` exports `Braintrust`, `Console`, `Datadog`, `JUnit`, and the
`EvalReporter` types. [src:reporters-index] (`Console` is undocumented but public.)

**Braintrust**: `Braintrust({ projectId?, projectName?, experimentName?, baseExperimentName?, baseExperimentId?, update? })`. [src:braintrust] Needs `npm install braintrust` and `BRAINTRUST_API_KEY`. [reporters] Per eval it logs:

```ts
this.#experiment.log({
  id: result.id,
  input: evaluation?.description ?? "",
  output: result.result.output ?? "",
  error: result.error ?? undefined,
  scores,          // one score per assertion name (lowest when names collide)
  metadata,        // ...evaluation.metadata, eveVerdict, eveToolCalls, eveAssertionScores,
                   // eveFailedAssertions, eveTraceIds, eveTraceContexts, ...
  metrics,         // toolCallCount, subagentCallCount, messageCount, reasoningBlockCount
  tags: evaluation?.tags ? [...evaluation.tags] : undefined,
});
```
[src:braintrust]

Note `input` is the eval *description*, not the prompt: give each dataset row a unique,
descriptive `description`. Gates log as binary scores under a `gate:` prefix "so
experiments diff gate regressions the same way they diff soft-score regressions"; the
experiment is tagged `eve`, `target:<kind>`, `eval:<id>`, and every eval tag, carries the
git commit/branch, and the URL is printed at the end of the run.
[reporters][src:braintrust]

**JUnit**: `--junit <path>` or `JUnit({ filePath, suiteName? })`; one `<testcase>` per
eval; `failures` counts `failed + scored` and the failure body is JSON with `verdict`,
`error`, `assertions`, `logs`. [src:junit][reporters]

**Datadog**: exists (`Datadog({ projectName })`, needs `dd-trace`); not relevant here.
[reporters]

### Custom reporter interface

```ts
interface EvalReporter {
  onRunStart(evaluations: readonly EveEval[], target: EveEvalTarget): void | Promise<void>;
  onEvalStart?(event: EveEvalStartEvent): void | Promise<void>;
  onSessionStart?(event: EveEvalSessionStartEvent): void | Promise<void>;
  onEvalComplete(result: EveEvalResult, context?: EveEvalCompleteContext): void | Promise<void>;
  onRunComplete(summary: EveEvalRunSummary): void | Promise<void>;
}
```
[reporters][src:reporter-types]

`onEvalComplete`'s `context` is `{ evaluation, target, traceContexts }`: this is the only
place tags and metadata meet results. [src:reporter-types][src:run] `onRunComplete` gets
the (scoped) `EveEvalRunSummary` with every `EveEvalResult`. [src:run] Config reporters
observe every eval; per-eval `reporters` observe only their evals; a shared instance is
bound once. `--skip-report` suppresses config and eval-defined reporters but not the CLI's
Console/JUnit. [src:run][reporters] So yes: a custom reporter can write a Markdown/JSON
summary with per-slice tables from the same data Braintrust gets.

### Making results shareable with a reviewer

What the primary sources support:

- Braintrust prints an experiment URL and supports a base experiment to diff against. [reporters][src:braintrust] Visibility to a reviewer depends on Braintrust account access; the docs say nothing about public sharing, so do not rely on it as the only surface.
- The `.eve/evals/<timestamp>/` directory is plain JSON and can be committed or attached ("upload the `.eve/evals/` directory as a failure artifact"). [running]
- There is no LangSmith reporter; LangSmith sees traces via the OpenTelemetry instrumentation path, not eval results. Eve's results reference traces by `traceContexts[].traceId`. [reporters][src:artifacts]

---

## 6. Targets: local and deployed

> An eval target is always an HTTP URL. `eve eval` starts a local dev server, while `eve eval --url <url>` runs against an existing server or deployment. The same eval files work for both [targets]

Local: the CLI boots a dev server on `127.0.0.1` with an ephemeral port and no auth, with
an evaluation flag and run id set in the environment before boot. [src:cli][targets]
Remote: Vercel OIDC token (verified against `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` or
`.vercel/project.json`), `VERCEL_AUTOMATION_BYPASS_SECRET`, or `EVE_EVAL_AUTH_TOKEN` as a
bearer override. [targets] `summary.target` records `{ kind: "local" | "remote", url,
capabilities: { devRoutes } }`. [src:types] `t.target.dispatchSchedule` only works with
dev routes; use `t.skip(reason)` for capability-gated evals. [targets]

CI shape: `eve eval --strict --url "$DEPLOY_URL" --junit .eve/junit.xml`. [running]
Stubs against a deployment require the `allowToolStubs` OIDC subject grant. [stubs]

---

## 7. Preview caveats: breaking changes in the changelog

Eval-relevant entries, newest first (all [changelog]):

| Version | Change |
| --- | --- |
| v0.79.1 | Labeled assertions report to Braintrust/Datadog under the bare label (`grounding`, not `score [grounding]`); labeled metrics start a new series. |
| v0.79.0 | Adds `t.score`; `AssertionResult` gains `key`; `score`, `threshold`, `passed` become optional: "custom reporters should treat `passed === false` as the failure signal". |
| v0.77.0 | `mockModel` defaults to a 1,000,000-token window. |
| v0.76.0 | Built-in tools move to the `eve__` namespace; tool-name helpers throw for `eve__tool`/`eve__skill`/retired names; skill loads no longer count toward tool-call assertions. |
| v0.75.0 | Tool stubs introduced (with `throw` outcomes in the same release). Deployment handoffs use a new checkpoint version. |
| v0.73.0 | Remote evals resolve deployments via project link or env; credentials withheld on mismatch. |
| v0.72.0 | **Breaking**: `evaluate` becomes `decide`; `evaluationModel(...)` becomes `decisionModel(...)`; `t.judge` takes `Experimental_DecisionModel` instances. |
| v0.70.2 | `session.compact()` for eval sessions. |
| v0.70.0 | `derived.models` and `derived.usage` on results. |
| v0.69.0 | `subagent.*` events removed in favour of `task.started`/`task.settled`/`agent.started`; Braintrust/Datadog report one score per name (lowest). |
| v0.65.0 | `errored` flag on assertion results. |
| v0.63.1 | Eval `setup`/`teardown` with typed context. |
| v0.63.0 | Subagent assertion statuses renamed (`pending` to `working`, `rejected` to `failed`). |
| v0.62.0 | **Breaking**: `t.judge.autoevals.*` removed; `t.judge(...)` with criteria/questions/batches; default `typesafe-ai/jev`; scores become probabilities. |
| v0.60.0 | `evaluate` moved to `eve/ai`; `eve/experimental/evaluate` removed. |
| v0.59.0 | **Breaking**: `t.newSession()` becomes `t.session()`; every `t.send()` creates a fresh session; conversation state moves from `t` to the session handle. |

The Cases page still carries a "Migrating existing evals" section [cases], and
`defineEval` rejects eleven legacy keys [src:define-eval]: expect further churn. Pin
`eve` to an exact version and read the changelog before upgrading.

---

## 8. Recommendations

### Recommended `evals/` layout

```text
evals/
├── evals.config.ts            # judge: { model: "typesafe-ai/jev" }, reporters: [Braintrust(...), markdown(...)], timeoutMs
├── reporters/
│   └── markdown.ts            # custom EvalReporter: writes docs/evals/runs/<label>.{md,json} with per-slice tables
├── fixtures/
│   ├── wiki-seed/             # a small immutable wiki snapshot (index.md, log.md, entities/..., schema.md)
│   ├── read-stubs.ts          # ToolStub[] serving wiki-seed pages through read_page/search_wiki
│   └── write-stubs.ts         # ToolStub[] acknowledging write_page/append_log without touching disk
├── data/
│   ├── ingest.yaml            # rows: { id, description, file, expected: { pages, entities, logLine }, tags }
│   ├── query.yaml             # rows: { id, description, prompt, expected: { answer, citations[] }, humanLabel? }
│   ├── lint.yaml              # rows: { id, description, seed, expected: { findings[] } }
│   └── safety.yaml            # rows: { id, description, document, mustNotCall[], expectedOutcome }
├── ingest/
│   ├── receipts.eval.ts       # fan-out over data/ingest.yaml; tags ["ingest", "trajectory"]
│   └── end-to-end.eval.ts     # one or two un-stubbed real-write cases
├── query/
│   ├── cited-answers.eval.ts  # fan-out; t.toolOrder(["read_index", "read_page"]); judge batch { grounded, cites }
│   └── unknowns.eval.ts       # questions the wiki cannot answer; judge choice expected "declined"
├── lint/
│   ├── contradictions.eval.ts
│   └── deadlines.eval.ts
├── safety/
│   ├── prompt-injection.eval.ts  # t.notCalledTool("write_page"); judge choice expected "refused"
│   └── approval-gates.eval.ts    # t.parked(); session.requireInputRequest({ toolName: "write_page" })
└── smoke.eval.ts
```

Why: directories are the only grouping eve knows, so `eve eval query` runs one slice and
every id starts with its slice name [cases][src:discover]; `tags` give cross-cutting
slices (`trajectory`, `tricky`, `real-model`) for `--tag`/`--exclude-tag` [running];
`metadata` carries `{ slice, caseId, expected, humanLabel }` into Braintrust and the
custom reporter [src:braintrust][src:reporter-types]; fixtures live where the docs put
them (`evals/data/`, sibling non-eval files) [overview][cases].

### Reporter choice for a shareable results page

Use **both**, declared once in `evals.config.ts`:

1. **Custom Markdown+JSON reporter (primary, committed to the repo).** It is the only
   surface that (a) needs no reviewer credentials, (b) sees tags/metadata next to
   results, and (c) renders in the GitHub README the reviewer reads in their 30 minutes.
   It writes one file per run, named from an env var (`EVAL_RUN_LABEL=before|after`),
   with a per-slice table (pass/scored/failed counts, mean per labelled score, mean tool
   calls, token usage from `derived.usage`) and a per-eval table with the Braintrust row
   link and trace ids. [src:reporter-types][src:artifacts]
2. **`Braintrust({ projectName, experimentName: process.env.EVAL_RUN_LABEL, baseExperimentName: "before" })`**
   as the hosted drill-down (per-row output, scores, diff vs base, trace ids in
   metadata), the standing fallback destination. [reporters][src:braintrust]

Plus `--junit .eve/junit.xml` in CI for free annotations. [running]

### Producing the before/after table

1. Baseline: `EVAL_RUN_LABEL=before eve eval --strict` produces `docs/evals/runs/before.{md,json}`, Braintrust experiment `before`, and `.eve/evals/<ts>/`.
2. Change the agent (prompt, tools, skills).
3. `EVAL_RUN_LABEL=after eve eval --strict` with `baseExperimentName: "before"` produces `after.{md,json}` and a Braintrust diff.
4. `scripts/eval-diff.ts before.json after.json` joins by eval id (ids are stable because they derive from file path plus row index [src:discover]; keep dataset row order fixed) and emits the Markdown before/after table by slice: pass rate, each labelled score's mean (`key` from `.label()`), failed-gate names, mean `toolCallCount`, total `usage`. Commit it to `docs/evals/before-after.md` and link from the README.
5. Both runs record `target.kind`, `derived.models`, and the judge model id, so the table can assert the agent model and judge were identical across runs. [src:types][src:judge]

If the custom reporter is not ready on day one, the same join works on two
`.eve/evals/<ts>/summary.json` files with the slice taken from the id prefix.

### Gaps that force a custom script

| Gap | Why it is a gap | Our workaround |
| --- | --- | --- |
| Before/after diff | No local diff; Braintrust diff is hosted only. [reporters] | `scripts/eval-diff.ts` over two run JSONs. |
| Slice aggregation | Artifacts omit `tags`/`metadata`/`description`. [src:artifacts] | Custom reporter (has `context.evaluation`) or id-prefix parsing. |
| Judge calibration | Judge handles are not awaitable; no agreement metric exists. [judge] | Record the human label via `t.score(...).label("human-...")`; compute agreement/kappa and a threshold sweep post hoc from `results.jsonl`. |
| Variance / repeats | No `--repeat`; one run per case. [cli] | Loop `eve eval` N times with distinct `EVAL_RUN_LABEL`s, or duplicate rows in the dataset. |
| Wiki state isolation | Evals run 8-wide by default and share `setup` context; our wiki tools read/write disk. [overview][src:run] | Stub reads/writes for most cases; for real-write cases use a per-session wiki root (tool reads a header or session id) or `--max-concurrency 1`. |
| Stub permission | Denied by default even locally. [stubs] | Author `agent/channels/eve.ts` granting `allowToolStubs: true` under `localDev()` (and the eval-runner OIDC subject for deployments). |
| LangSmith results view | No LangSmith reporter; traces only via OTel. [reporters] | Treat LangSmith as the trace viewer; link trace ids from the Markdown report. |
| Reviewer access to Braintrust | Sharing semantics not documented. | The committed Markdown report is the primary surface. |
