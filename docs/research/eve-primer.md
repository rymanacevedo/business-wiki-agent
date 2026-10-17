# Eve project primer (for the 3-day build)

Resolves issue #6. Every claim cites a primary source: eve.dev docs (`.md` variants), the `eve@0.80.1` npm tarball, the vercel/eve README, the eve changelog, the live AI Gateway model catalog, and Vercel AI Gateway docs. Fetched 2026-10-17.

Source shorthand used below:

- `[GS]` https://eve.dev/docs/getting-started.md
- `[PS]` https://eve.dev/docs/concepts/project-structure.md
- `[AF]` https://eve.dev/docs/reference/agent-files.md
- `[AC]` https://eve.dev/docs/agent-config.md
- `[IN]` https://eve.dev/docs/instructions.md
- `[SK]` https://eve.dev/docs/skills.md
- `[TO]` https://eve.dev/docs/tools.md
- `[HITL]` https://eve.dev/docs/human-in-the-loop.md (the ticket's `/docs/tools/human-in-the-loop.md` URL returns HTTP 500; this is the page `tools.md` links to)
- `[BT]` https://eve.dev/docs/concepts/built-in-tools.md
- `[SA]` https://eve.dev/docs/subagents.md
- `[FE]` https://eve.dev/docs/guides/frontend/overview.md
- `[NX]` https://eve.dev/docs/guides/frontend/nextjs.md
- `[CH]` https://eve.dev/docs/channels/eve.md
- `[AU]` https://eve.dev/docs/guides/auth-and-route-protection.md
- `[DV]` https://eve.dev/docs/guides/deployment/vercel.md
- `[DO]` https://eve.dev/docs/guides/deployment/overview.md
- `[TUI]` https://eve.dev/docs/guides/dev-tui.md
- `[API]` https://eve.dev/docs/reference/typescript-api.md
- `[CLI]` https://eve.dev/docs/reference/cli.md
- `[EV]` https://eve.dev/docs/evals/overview.md, `[EJ]` https://eve.dev/docs/evals/judge.md, `[ER]` https://eve.dev/docs/evals/running.md
- `[DEC]` https://eve.dev/docs/guides/decide.md
- `[EX]` https://eve.dev/docs/concepts/execution-model-and-durability.md
- `[SB]` https://eve.dev/docs/sandbox.md, `[ST]` https://eve.dev/docs/concepts/state.md
- `[CL1]` https://eve.dev/changelog.md, `[CL2]` https://eve.dev/changelog/page/2.md
- `[README]` https://github.com/vercel/eve/blob/main/README.md
- `[NPM]` https://registry.npmjs.org/eve/latest and the unpacked `eve-0.80.1.tgz`
- `[CAT]` https://ai-gateway.vercel.sh/v1/models (live catalog JSON)
- `[GWA]` https://vercel.com/docs/ai-gateway/authentication-and-byok, `[GWO]` https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc
- `[AISDK-GW]` https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway, `[AISDK-DEC]` https://ai-sdk.dev/docs/ai-sdk-core/decisions

---

## 1. Facts at a glance

| Fact | Value | Source |
| --- | --- | --- |
| Current eve version | `0.80.1` (npm `latest`) | `[NPM]` |
| Node requirement | `engines.node: ">=24"`; docs say "Node.js 24 or newer" | `[NPM]`, `[GS]` |
| Status | "eve is currently in beta" / Vercel public beta terms | `[README]`, agents.md |
| Peer deps declared by eve | `ai ^7.0.137`, `chat ^4.42.0`, `braintrust ^3.0.0`, `@opentelemetry/api ^1.0.0`, `dd-trace`, `just-bash`, `microsandbox` (all optional peers) | `[NPM]` |
| Scaffold pins | `ai ^7.0.137`, `zod 4.5.4`, `@vercel/connect 2.5.2`, `typescript 7.0.2`, `@types/node` = Node major | `[NPM]` `dist/src/setup/scaffold/create/project.js` |
| Docs ship in the package | `node_modules/eve/docs/README.md` maps tasks to pages; prefer it over eve.dev because it matches the installed version | `[README]`, llms.txt |
| Agent model (this project) | `anthropic/claude-sonnet-5.5` — present in the Gateway catalog | `[CAT]` |
| Judge model (this project) | must be a *decision* model, not a chat model; see section 5 | `[EJ]`, `[DEC]`, `[CAT]` |
| What happened running `npx eve@latest init` on this machine (Node 22.23.2) | npm `EBADENGINE` warning, then `eve requires Node.js >=24. You are running v22.23.2.` and exit 1; nothing scaffolded | observed 2026-10-17 |

Install Node 24 first (nvm is already present: `~/.config/nvm`). The map's "Node 22" environment fact is a hard blocker for `eve init`, `eve dev`, `eve build`, and `eve eval`.

---

## 2. Scaffold: `npx eve@latest init`

```bash
npx eve@latest init my-agent --model anthropic/claude-sonnet-5.5 --non-interactive
cd my-agent
npm run dev        # opens the dev TUI
```

- `eve init` "creates the project, installs dependencies, initializes Git, and opens the terminal UI". `--non-interactive` (`-n`) returns after scaffolding. "Noninteractive and coding-agent invocations return without starting an interactive session." `[GS]`, `[CLI]`
- `--model <provider/model-id>` default is `openai/gpt-6-luna-fast`; `--reasoning` defaults to `high` only when `--model` is omitted, otherwise provider default. Accepts `none|minimal|low|medium|high|xhigh|provider-default`. `[CLI]`, `[README]`
- `--channel-web-nextjs` adds the Web Chat Next.js app at init time but "does not provision authentication"; for an existing project use `eve add channel/web`. `[CLI]`, `[CH]`
- Add to an existing `package.json` project: `npx eve@latest init .` (adds `agent/` plus missing `eve`, `ai`, `zod`). `[GS]`, `[CLI]`
- Manual install: `npm install eve@latest ai zod`, declare Node 24 in `package.json`, create `agent/instructions.md`. `[GS]`
- Fresh projects use the parent workspace's package manager if any, otherwise "the manager that launched `eve init`" (scaffold source defaults to `pnpm`). `[CLI]`, `[NPM]`

### Generated files (from `eve@0.80.1` `dist/src/setup/scaffold/create/project.js`, `web-template.js`, `instructions-template.js`)

`package.json` (template; `__X__` tokens are substituted):

```json
{
  "name": "__EVE_INIT_APP_NAME__",
  "version": "0.0.0",
  "type": "module",
  "imports": { "#*": "./agent/*", "#evals/*": "./evals/*" },
  "scripts": {
    "build": "eve build",
    "deploy": "eve deploy",
    "dev": "eve dev",
    "eval": "eve eval",
    "start": "eve start",
    "typecheck": "tsc"
  },
  "dependencies": {
    "@vercel/connect": "2.5.2",
    "ai": "^7.0.137",
    "eve": "^0.80.1",
    "zod": "4.5.4"
  },
  "devDependencies": { "@types/node": "<node major>", "typescript": "7.0.2" },
  "engines": { "node": ">=24" }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node", "eve/workflow-modules"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["agent/**/*.ts", "evals/**/*.ts"]
}
```

`agent/agent.ts`:

```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "__EVE_INIT_MODEL__",
  // reasoning: "high",   // only when --reasoning given
});
```

`agent/channels/eve.ts` (the placeholder you must replace before production browser traffic):

```ts
import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    vercelOidc(),      // TUI + Vercel deployments
    localDev(),        // eve dev only; ignored in production
    placeholderAuth(), // 401 in production until replaced
  ],
});
```

`agent/instructions.md` (generic identity text), `.gitignore` (`node_modules`, `.env*`, `.eve`, `.vercel`, `.next`, `.output`, `.nitro`, `dist`, `*.tsbuildinfo`), `README.md`, `AGENTS.md` (tells coding agents to read `node_modules/eve/docs`), and `CLAUDE.md` containing only `@AGENTS.md`. No `evals/` directory is scaffolded; `tsconfig` already includes `evals/**/*.ts`. `[NPM]`

`eve init` also adds eve to `package.json#imports` aliases `#*` -> `./agent/*`, so tools can `import { x } from "#lib/x"`. `[NPM]`, `[PS]`

---

## 3. Dev TUI basics

`eve dev` starts the local server (default port 2000) and the TUI. `[CLI]`

| Command | Purpose |
| --- | --- |
| `/model provider/model-id` | change model, speed, reasoning (edits `agent/agent.ts`) |
| `/login` | connect Vercel account, AI Gateway key, ChatGPT, OpenAI, or Anthropic key |
| `/new` (`/reset`), `/clear`, `/compact`, `/cancel` | session controls |
| `/add channel/slack` etc. | install integrations |
| `/deploy` | deploy to Vercel production |
| `/traces`, `/info`, `/loglevel`, `/help`, `/exit` | diagnostics |

All from `[TUI]`. Notes:

- Approval prompts and `ask_question` prompts render inline; `Enter` answers. Steering during a running turn is `Enter`. `Esc`/`Ctrl+C` cancels. `[TUI]`
- `/login`, `/model`, `/add`, `/deploy` are unavailable under `eve remote connect`. `[TUI]`
- Local credentials are discovered only in development; "Deployments need explicitly provisioned `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or supported project OIDC credentials." `[TUI]`
- Logs: `.eve/logs/` and `eve logs`; local traces: `.eve/traces/` and `eve traces show`. `[CLI]`
- `eve info --json` lists discovered tools/skills/subagents and diagnostics; run it before `eve dev` when something is off. `[CLI]`
- `eve dev` makes a bundled `self-modification__agent` subagent available locally; not in production builds. `[SA]`
- Useful non-TUI flags: `eve dev --no-ui`, `--port`, `--subagents full|collapsed|hidden`, `--logs all`. `[CLI]`

---

## 4. Project layout

Single root agent in `agent/`; app code beside it; evals in `evals/` beside `agent/` (not inside). `[PS]`, `[AF]`

```text
project/
├── package.json
├── agent/
│   ├── agent.ts            # defineAgent (optional; model required if present)
│   ├── instructions.md     # required on root
│   ├── tools/*.ts          # file name = tool name (get_weather.ts -> get_weather)
│   ├── skills/*.md | <name>/SKILL.md
│   ├── subagents/<name>/agent.ts
│   ├── channels/eve.ts     # HTTP channel + route auth
│   ├── instrumentation/*.ts
│   ├── sandbox/workspace/** (seeded into /workspace)
│   ├── lib/                # shared helpers, import-only
│   └── hooks/, memory/, schedules/, connections/, extensions/
├── evals/evals.config.ts + *.eval.ts
├── app/ + next.config.ts   # optional Next.js
```

- Names come from paths; no `name`/`id` fields. `[API]`, `[AF]`
- Modules named `*.test.*`, `*.spec.*`, and `__tests__/` are ignored by discovery. `[AF]`
- Nothing authored may be named `eve` or start with `eve__`. `[BT]`
- A root `agent/` makes the project single-agent even if `agents/` exists. Workspaces (`agents/<name>/agent/`) are only for separately addressable agents; not needed here. `[PS]`, `[AF]`

---

## 5. Agent config, models, credentials

### `agent/agent.ts`

```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5.5",   // AI Gateway id string
  reasoning: "medium",                    // "provider-default"|"none"|"minimal"|"low"|"medium"|"high"|"xhigh"
  compaction: { thresholdPercent: 0.75 }, // default 0.9
  limits: {
    maxInputTokensPerSession: 2_000_000,  // default 40_000_000 for root sessions
    maxTokenCostUsdPerSession: 5,         // USD, model tokens only; Gateway reports cost
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1000, // default 30 days
  },
  // defaultTools: false,   // drop bash/read_file/write_file/web_fetch/web_search/agent defaults
  // tool: false,           // remove the built-in root-copy `agent` tool
});
```

- `model` is required when `agent.ts` exists; omit the file to get `openai/gpt-6-luna-fast` + `reasoning: "high"`. `[AC]`
- A static Gateway model id is compile-only; dynamic models / provider `LanguageModel`s are runtime entries. `[AC]`, `[API]`
- `eve set model anthropic/claude-sonnet-5.5 --reasoning medium` edits the file from the CLI. `[CLI]`
- Compaction is on by default; eve adds a fixed checkpoint-prompt envelope so it triggers earlier than the raw estimate. `[AC]`
- Session limits pause the turn with a Continue/Stop prompt; sessions that cannot ask a human (schedules, delegated runs without proxying) fail with `SESSION_TOKEN_LIMIT_REACHED` / `SESSION_TOKEN_COST_LIMIT_REACHED`. `[AC]`
- Prompt caching is automatic for Gateway models; `modelOptions.promptCache` is rejected on Gateway models. `[AC]`
- For Gateway calls eve sets `providerOptions.gateway.sessionId` to the `gen_ai.conversation.id` so a conversation's generations (including subagents and compaction) group together. `[AC]`
- Experimental knobs you should NOT need: `experimental.workflow.modelCallsPerStep` (widens replay unit), `experimental.workflow.retention`, `experimental.workflow.world`. `[AC]`

### Model ids (confirmed against the live catalog `[CAT]`)

| Role | Gateway id | Catalog facts |
| --- | --- | --- |
| Agent | `anthropic/claude-sonnet-5.5` | type `language`; context 1,000,000; max output 128,000; tags `reasoning`, `tool-use`, `structured-output`, `file-input`, `vision`, `explicit-caching`; `reasoning_options` effort `low|medium|high|xhigh|max`; `temperature: false`; price $2/M in, $10/M out, cache read $0.10/M; released 2026-09-28 |
| Cheap Anthropic sibling | `anthropic/claude-haiku-5.5` | 1M ctx; effort incl. `none`; $0.10/M in, $0.50/M out (tiered) |
| Non-Anthropic chat models (for a *chat* judge or routing) | `openai/gpt-6-sol` ($2/$10, 1.05M ctx), `openai/gpt-6-luna` ($0.10/$0.50), `google/gemini-4-argon` ($2/$10, temperature supported) | all `tool-use` + `structured-output`; all `reasoning` effort configurable |

The docs' own examples use `anthropic/claude-opus-5.5`, `anthropic/claude-sonnet-5`, `openai/gpt-6-luna-fast`, `openai/gpt-6-sol`. `[AC]`, `[DEC]`

### Judge model: it must be a decision model

This is the important surprise for the "different-family judge" decision:

- `t.judge(...)` "calls `decide` from `eve/ai` and defaults to `typesafe-ai/jev`". "String model IDs resolve through the default provider's decision API. Gateway accepts native decision models such as `typesafe-ai/jev`; passing a language model ID such as `openai/gpt-6-luna` does not automatically select the OpenAI adapter. Use a decision-model instance as shown above for language models." `[EJ]`
- Using a chat model as judge therefore requires a provider package and *that provider's own credentials*: e.g. `import { openai } from "@ai-sdk/openai"; t.judge("...", { model: openai.decisionModel("gpt-6-luna") })` -> needs `OPENAI_API_KEY`, which breaks the one-credential (Gateway) decision. `[EJ]`, `[AISDK-DEC]` ("Registered providers keep their own credentials and settings")
- Gateway-native decision models in the catalog (`type: "evaluation"`) `[CAT]`: `typesafe-ai/jev` (default; 64k tokens/request limit), `typesafe-ai/jev-1.14.0`, `openai/gpt-6-luna-decisions` ("evaluates classification and scoring questions ... using OpenAI's Decisions API. It supports predicate, choice, and score questions with probabilities and confidence values"; $0.10/M input; effort `none..max`), `microsoft/microsoft-decision-1`, `perplexity/pplx-decider-v1.2`, `liquid/d1`, `liquid/d1-ultra`, `convaiinnovations/laya`, `scaledown/scaledown-classify-1`.
- Recommendation: judge = `openai/gpt-6-luna-decisions` (OpenAI family, Gateway-native, one credential). The docs only name `typesafe-ai/jev` as a Gateway decision example, so verify on day 1 with a single `t.judge` call that `openai/gpt-6-luna-decisions` is accepted by `decide`; fallback is `typesafe-ai/jev` (TypeSafe AI family, still "different family" from Anthropic). Treat `t.judge` boolean scores as probabilities, not calibrated confidence. `[EJ]`

```ts
// evals/evals.config.ts
import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  judge: { model: "openai/gpt-6-luna-decisions" }, // verify day 1; fallback "typesafe-ai/jev"
});
```

Precedence: per-call `t.judge(..., { model })` > per-eval `defineEval({ judge })` > `defineEvalConfig({ judge })` > default. `[EJ]`

`approval: auto()` uses the same decision machinery and defaults to `typesafe-ai/jev`. `[HITL]`, `[DEC]`

### Credentials: `AI_GATEWAY_API_KEY` vs OIDC

- A string model id "uses the Vercel AI Gateway and requires Vercel project OpenID Connect (OIDC) or `AI_GATEWAY_API_KEY`." `[DO]`
- On Vercel deployments, "The deployment authenticates through project OpenID Connect (OIDC), so you don't need a provider API key for that path." `[DV]`
- Locally: `eve link` "pulls the project's environment so an AI Gateway credential (`VERCEL_OIDC_TOKEN` or `AI_GATEWAY_API_KEY`) lands in `.env.local`." `[CLI]`. OIDC tokens "are only valid for 12 hours, so you will need to refresh them periodically during local development ... by running `vercel env pull` again." `[GWO]`
- API keys "never expire unless you revoke them" and are deactivated when their creator leaves the team. "An explicit API key takes precedence over the OIDC token." `[GWA]`
- `/login` in the TUI can also store a Gateway key or Vercel account in the OS secret store (never written to project files) and records non-secret metadata in `.eve/provider.json`. `[TUI]`
- Simplest for a 3-day build: create one AI Gateway API key, put `AI_GATEWAY_API_KEY` in `.env.local` locally and in the Vercel project env for deploys and `eve eval --url`. Evals "run against a live model, so the CI environment must provide the model-provider credentials." `[ER]`
- Direct-provider helpers exist (`anthropic()` from `eve/models/anthropic`, needs `ANTHROPIC_API_KEY`) but are not needed. `[AC]`, `[API]`

---

## 6. Instructions and skills

### Instructions `[IN]`

- `agent/instructions.md` is the system prompt verbatim; "Keep this file to stable behavior such as identity, tone, and standing rules." System-role instructions are "outside history on every model call".
- Split across `agent/instructions/` (non-recursive; `.md` and `.ts`; alphabetical by filename; root file first). Do not author both `instructions.md` and `instructions.ts` at root (build error).
- `defineInstructions({ content, role?: "system" | "user" })` from `eve/instructions` for TypeScript composition; static modules run once at build time. `?raw` asset imports are allowed (`import prompt from "../prompts/x.md?raw"`). `[IN]`, `[API]`
- User-role instructions enter new-session history once and are subject to compaction; system-role content survives compaction.
- Size guidance: "Keep instructions short and stable. Long or situational procedures belong in skills, where they only enter context when the request calls for them." Put stable content first for prompt-cache reuse.

### Skills `[SK]`

- Flat `agent/skills/<name>.md` or packaged `agent/skills/<name>/SKILL.md` (+ `references/`, `assets/`, `scripts/`). Name = path slug (ASCII letters/digits/`_`/`-`, max 64 chars).
- Loading: eve lists each skill's name + description in the system prompt; the model loads the body with `eve__skill({ name })`. Description is the routing hint: write it as "Use when ...". A flat skill without frontmatter advertises its first non-empty line.
- `deferred: true` keeps a skill out of the prompt entirely; found via `eve__search`.
- Skills add instructions only, never tools. Supporting files are seeded to `$HOME/.agents/skills/<skill>/` in the sandbox and read with `read_file`/`bash`; tools cannot read skill files (import data from `lib/` instead).
- Skills are per-agent: subagents do not see the root's skills.
- For this project: the Karpathy schema doc (wiki conventions) fits a skill or `agent/instructions/` entry; the ingest/query/lint procedures fit three skills so they do not bloat every turn.

---

## 7. Tools

### `defineTool` `[TO]`, `[API]`

```ts
// agent/tools/write_wiki_page.ts  -> tool name "write_wiki_page"
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

export default defineTool({
  description: "Write or replace one wiki page. Use after reading index.md.",
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  outputSchema: z.object({ path: z.string(), bytes: z.number() }), // optional, types the return
  approval: {
    request: always(),
    prompt: ({ input }) => `Write ${input.path} (${input.content.length} chars)?`,
  },
  label: { start: ({ path }) => `Write ${path}` },
  availableInSubagents: true,  // default true; false = root session only
  deferred: false,             // true = hidden until eve__search finds it
  async execute({ path, content }, ctx) {
    // runs in the app runtime (process.env available), NOT in the sandbox
    return { path, bytes: content.length };
  },
  toModelOutput(output) {
    return { type: "text", value: `Wrote ${output.path}` }; // or { type: "json", value }
  },
  // endsTurn: true | (output) => boolean  (declare after execute for inference)
});
```

Semantics:

- `inputSchema` required (Zod, Standard Schema, or JSON Schema; `z.object({})` for none). Input validated before `execute`. Optional fields stay optional (strict mode disabled). `[TO]`
- `execute` may be sync, async, or an async generator (earlier `yield`s are `action.partial` snapshots; last yield is the result; `return` value ignored). `[TO]`
- Outputs must be JSON-serializable (no `Date`, `Map`, `NaN`, cycles). `[TO]`
- `toModelOutput` affects only what the model sees; channels/hooks still get the full output. Use `toolOutput.content([...toolOutputPart.text(), toolOutputPart.file(base64, { mediaType })])` from `eve/tools` to send images/PDF bytes to the model. `[TO]`
- `ctx`: `ctx.session` (id, turn, auth, parent), `ctx.callId`, `ctx.toolName`, `ctx.messages`, `ctx.abortSignal`, `ctx.getSandbox()`, `ctx.getToken()`, `ctx.requireAuth()`, `ctx.approval` (present only after a human approved: `responder`, `responder.getToken(provider)`). `[TO]`, `[API]`
- `endsTurn: true` ends the turn after a successful call with no reply; ignored in delegated sessions and structured-output turns; rejected by `defineWorkflowTool`. eve appends a fixed sentence to the description for `true`, not for a function. `[TO]`
- `deferred: true`: not in the tool list; model finds it with `eve__search` and calls it via `eve__tool({ name, input })`; approvals/`endsTurn`/`toModelOutput`/hooks see the real name. `[TO]`, `[BT]`
- Error semantics: "If an authored tool's `execute` function throws, eve records a failed `action.result` and gives the error to the model as a tool error. The model can respond, choose another action, or call the tool again. eve does not automatically call the tool again." No terminal-error class or retry policy. `[TO]`
- Replay semantics: "Completed steps never re-run; eve replays the recorded result. A step interrupted mid-execution re-runs, so make non-idempotent side effects ... idempotent, or gate them with approval." Order of protection: idempotency key > recorded application operation > human approval. `[TO]`, `[EX]`
- `defineWorkflowTool` (body starts with `"use workflow"`, gets `ctx.agent` and `ctx.ask`) is for durable waits; not needed for simple wiki tools. `[TO]`

### Approval API `[HITL]`

```ts
import { always, once, auto, never } from "eve/tools/approval";
import type { Approval, ApprovalContext, ApprovalStatus } from "eve/tools/approval";
```

| Helper | Behavior |
| --- | --- |
| `never()` | default when omitted; no approval |
| `once()` | approval the first time the tool runs in a session; auto-allow after (pending prompts remain independent) |
| `always()` | approval before every call |
| `auto({ model?, instructions?, criteria? })` | decision model classifies `clear` vs `caution`; defaults to `typesafe-ai/jev`; the tool input is sent to the decider |

Custom policy (input-dependent):

```ts
approval: ({ session, toolInput, toolName, approvedTools, callId, abortSignal }) => {
  if (toolInput?.path === "index.md") return "user-approval";   // pause for a person
  if (toolInput?.path?.startsWith("raw/")) return { type: "denied", reason: "raw sources are immutable" };
  return "not-applicable";                                       // run without prompt
},
```

- Return values: `"user-approval"`, `"not-applicable"`, `"approved"`, `"denied"`, or `{ type: "approved" | "denied", reason }`; booleans still accepted (`true` = user-approval). Sync or promise. `[HITL]`
- Object form `{ request, prompt, response }`: `prompt({ input, toolName, callId })` customizes the question text; `response({ request, response, session, auth })` decides who may settle it (`{ status: "allowed" }` / `{ status: "rejected", reason }`). By default only the requester's turn owner can approve. `[HITL]`
- Approved calls run as the *requester*, never the approver (changed in 0.78.0). `[CL2]`
- Skip approval for schedule-dispatched turns by matching `session.auth.current` = `{ authenticator: "app", principalId: "eve:app", principalType: "runtime" }`. `[HITL]`
- Pause/resume protocol: `input.requested` event -> `turn.waiting` with `on: "input"` -> client answers with `inputResponses: [{ requestId, optionId: "approve" | "cancel", text? }]` or a plain message matching an option label. Request `kind` is `tool-approval`, `question`, or `session-limit`. A denial's `text` reaches the model as the reason. `[HITL]`
- A follow-up message that does not match an option *cancels* the pending approval and steers the turn instead (`input.resolved` with `outcome: "ignored"`). `[HITL]`
- Questions: add `ask_question` with `eve add tool/ask_question` -> `agent/tools/ask_question.ts` containing `import { askQuestion } from "eve/tools/ask_question"; export default askQuestion();`. Model calls `{ question, options? }` (2-3 options). Returns `{ status: "answered", answer }`, `{ interrupted: true }`, or `{ status: "unavailable" }`. `[HITL]`, `[BT]`

### Built-in tools and how to disable them `[BT]`

Default (optional) tools, enabled unless `defaultTools: false`: `bash`, `read_file`, `write_file`, `web_fetch`, `web_search` (only for providers that support it; Gateway uses Exa), and root-only `agent`. Each occupies `agent/tools/<name>.ts`:

```ts
// agent/tools/bash.ts  -> remove bash entirely
import { disableTool } from "eve/tools";
export default disableTool();
```

```ts
// agent/tools/write_file.ts -> wrap and restrict instead of removing
import { defineTool } from "eve/tools";
import { writeFile } from "eve/tools/write_file";
export default defineTool({
  ...writeFile,
  async execute(input, ctx) {
    if (!input.filePath.startsWith("/workspace/wiki/")) throw new Error("write_file limited to /workspace/wiki");
    return writeFile.execute(input, ctx);
  },
});
```

Re-exports to restore a default: `export { default } from "eve/tools/bash"` (also `read_file`, `write_file`, `web_fetch`, `web_search`, `agent`, `glob`, `grep`). Opt-in tools: `ask_question`, `glob`, `grep`, `no_reply` (`noReply()` from `eve/tools/no_reply`), `sleep` (`sleep()` from `eve/tools/sleep`); add with `eve add tool/<name>` or author the file. Catalog tools `eve__search`, `eve__tool`, `eve__skill` are added automatically whenever the session has something they reach (any skill => `eve__skill`); `eve__task_wait`/`eve__task_cancel` appear when any task-running tool (incl. subagents) exists. `defaultTools: false` does not remove catalog tools. `[BT]`

Recommended for the wiki agent: `defaultTools: false`, then author the wiki read/search/write tools; re-add `read_file`/`bash` only if the agent needs to open uploaded PDFs in the sandbox (`read_file` shows PDFs <= 20 MiB and images <= 3 MiB to the model). `[BT]`

### Where tool code runs, and where files live (matters for the wiki)

- "Authored tools run in your app runtime with full access to `process.env`, not in the sandbox." `[TO]`
- The sandbox (`/workspace`) is session-owned and persists across turns, but "Built-in environments do not expose cross-session sharing." `agent/sandbox/workspace/**` seeds files into each new session's `/workspace`. `[SB]`, `[AF]`
- `defineState` from `eve/context` is per-session durable memory; never shared with subagents. `[ST]`
- Cross-session persistence options in eve: the memory system (`eve/memory`, `fileMemory`, `vercelBlob` from `eve/memory/file/vercel`) or your own store accessed from tools. `[API]`, `[ST]`
- Consequence: a wiki that must outlive one chat session cannot live only in `/workspace` or in Vercel function local disk; the storage decision (Vercel Blob, a DB, a git repo, or an in-repo fixture for evals) belongs to the scope/architecture ticket.

---

## 8. Subagents `[SA]`

Two kinds:

| | Root built-in `agent` tool | Declared subagent `agent/subagents/<id>/` |
| --- | --- | --- |
| Instructions / tools / skills / connections / hooks | inherited copy of root (minus root-only `agent`) | its own only; inherits nothing |
| Sandbox | reuses parent sandbox (writes visible to root) | own sandbox (fresh) |
| State / history | fresh | fresh |
| Config | none needed; disable with `tool: false` on root or `disableTool()` at `agent/tools/agent.ts` | `defineAgent({ description /* required */, model, tool?: false | "deferred" })` |
| Channels / schedules | root-only | root-only |

- Every subagent call is a task: the call "returns a receipt naming the task's `taskId` right away, the child works while the parent continues, and the child's final reply ... arrives as the task's result". Model-visible input is `{ message: string; taskId?: string }`; the child never sees the parent's history. The parent gets `eve__task_wait` / `eve__task_cancel`. `[SA]`, `[BT]`
- Tool name = directory name (`agent/subagents/researcher/` -> `researcher`); `agent/subagents/agent/` is reserved. A subagent named like an authored tool collides unless `tool: false`. `[SA]`
- Child HITL requests (approvals, questions) surface on the parent session; a subagent does not act as an approval boundary ("Put sensitive tools behind `approval` ... wherever those tools can be called"). `[SA]`
- Child usage draws from the parent's token/cost quota share. `[AC]`
- Subagent model calls retry transient provider failures up to three times. `[SA]`
- Traces: a local subagent's first turn nests under the caller's trace; later child turns start new traces sharing `gen_ai.conversation.id`. `[CLI]`
- "Split out a subagent when the task needs a different prompt or specialist role, a narrower tool surface, or its own runtime context. Don't reach for one when a skill would do." `[SA]`

Guidance for this build: stay single-agent for ingest/query/lint on days 1-2. The costs of a declared subagent here are real: it inherits no tools, so the wiki tools would need to be shared through `lib/` and re-declared; `defineState` is not shared; approvals are proxied asynchronously; and the TUI/eval story gets a second session to inspect. A per-document "summarize this raw source" subagent (root copy via the built-in `agent` tool, which shares the sandbox and tools) is the cheapest parallelism if ingest latency becomes a problem, and `t.calledTool("agent")` can assert on it. Decide in the scope ticket; do not pre-commit.

---

## 9. Frontend: Next.js mount, HTTP channel, auth

### HTTP channel (`/eve/v1`) `[CH]`

Default routes (no code needed): `GET /eve/v1/health` (public; `{ ok, status: "ready", workflowId }`), `GET /eve/v1/info`, `POST /eve/v1/session` (create; body optional `{ message }`), `POST /eve/v1/session/:id` (`{ message }` or `{ inputResponses }`), `.../cancel`, `.../clear`, `.../compact`, `.../reset`, `GET /eve/v1/session/:id/stream` (NDJSON).

```bash
curl -X POST https://<deployment>/eve/v1/session -H "Content-Type: application/json" -d '{"message":"hi"}'
# {"ok":true,"sessionId":"wrun_A","status":"accepted"}
curl -X POST https://<deployment>/eve/v1/session/wrun_A -H "Content-Type: application/json" \
  -d '{"inputResponses":[{"requestId":"req_A","optionId":"approve"}]}'
```

File parts: `{ type: "file", mediaType, filename, data: <base64 | data: URL | URL> }`; default `uploadPolicy` 25 MB, but Vercel Functions cap request bodies at 4.5 MB (base64 ~3.3 MB) — use `fetchFile` + your own storage for bigger PDFs. `[CH]`

### Mount in Next.js `[NX]`

```ts
// next.config.ts
import type { NextConfig } from "next";
import { withEve } from "eve/next";
const nextConfig: NextConfig = {};
export default withEve(nextConfig); // mounts agent/ at /eve/v1/*; options: eveRoot, agents, eveBuildCommand, devServerTimeoutMs
```

- Dev: `next dev` boots the eve dev server beside it and rewrites `/eve/v1/*`; browser talks only to the Next origin. `[NX]`
- Vercel: "The web app and the eve runtime deploy as a single project. `withEve()` writes Build Output `services` for eve and `routes` that send `/eve/v1/**` to that service". Generated services run the installed eve binary from the agent root. `[NX]`
- Local prod: `eve build` first, then `next build && next start` (eve served on port 4274, override `EVE_NEXT_PRODUCTION_PORT`). `[NX]`
- Fastest path: `eve add channel/web`, choose **Next.js** hosting. It generates `app/_components/agent-chat.tsx` (uses `useEveAgent` from `eve/react`), routes `/`, `/s`, `/s/[sessionId]` (durable session URLs with `resume: true`), wraps `next.config.ts` with `withEve()`, and sets scripts `dev: next dev`, `dev:eve: eve dev`, `build: next build`, `build:eve: eve build`, `start: next start`. Non-interactive: `eve add channel/web --non-interactive --answer 'web-hosting="vercel"' --answer 'web-authentication="custom"'`. `[NX]`, `[CH]`, `[NPM]` (`web-template.js`)

### `useEveAgent` `[FE]`

```tsx
"use client";
import { useEveAgent, openConversationInputs } from "eve/react";

const agent = useEveAgent({ /* prewarm, agent, host, auth, headers, initialSession, resume, followSubagents, onEvent, onFinish, onSessionChange */ });
agent.status;                       // "ready" | "resuming" | "submitted" | "streaming" | "error"
agent.data.messages;                // EveMessage[] with parts (text, reasoning, file, dynamic-tool, authorization)
await agent.send("Ingest this receipt", { turnPolicy: "steer", clientContext: { route: "/upload" } });
await agent.send([{ type: "text", text: "Summarize" }, { type: "file", data: dataUrl, mediaType: "application/pdf", filename: "lease.pdf" }]);
const pending = openConversationInputs(agent.data).map((i) => i.request); // HITL ledger
await agent.respond([{ requestId: req.requestId, optionId: option.id }]);    // or { requestId, text }
await agent.cancel(); agent.reset();
```

- Render `request.kind` (`tool-approval` | `question` | `session-limit`), `request.prompt`, `request.options[{ id, label }]`. Tool parts show `part.toolMetadata.eve.label` (human label), not `toolName`. `[FE]`
- Persist `{ events, session: { sessionId, streamIndex } }` and remount with `initialEvents`, `initialSession`, `resume: true` to restore a chat. `[FE]`
- Subagent detail is not in `data.messages`; pass `followSubagents: true` and read `data.agents[sessionId]`. `[FE]`
- Same-origin requests send app cookies; for bearer auth pass `headers: async () => ({ authorization: ... })`. `[NX]`

### Route protection: replacing `placeholderAuth()` `[AU]`, `[CH]`

- Default policy fails closed: with no `agent/channels/eve.ts`, or with the scaffolded one, production browser traffic gets `401`. `localDev()` only matches under `eve dev`/`vercel dev` (`EVE_DEV=1` or `VERCEL=1`+`VERCEL_ENV=development`); `vercelOidc()` admits the CLI/TUI and other deployments in the project, not browser users. `[AU]`
- Helpers from `eve/channels/auth`: `localDev()`, `vercelOidc()`, `none()`, `httpBasic(credentials, { realm })`, `jwtHmac()`, `jwtEcdsa()`, `oidc()`, `placeholderAuth()`, plus `UnauthenticatedError`, `ForbiddenError`, `withAuthChallenges`, `extractBearerToken`, `verify*` functions. The walk is ordered; an entry returns a `SessionAuthContext` to accept, `null` to skip, or throws to reject. `[AU]`
- Three realistic choices for a reviewer-facing demo:

```ts
// (a) shared password for reviewers — keep the secret in env
import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, vercelOidc } from "eve/channels/auth";
export default eveChannel({
  auth: [
    vercelOidc(),
    localDev(),
    httpBasic(
      { username: "reviewer", password: process.env.ROUTE_AUTH_BASIC_PASSWORD! },
      { realm: "wiki-agent" },
    ),
  ],
});
// (b) public demo (synthetic data only): auth: [vercelOidc(), localDev(), none()]
// (c) eve add channel/web --answer 'web-authentication="vercel"' -> Better Auth + Sign in with Vercel (team members only;
//     writes VERCEL_APP_CLIENT_ID / VERCEL_APP_CLIENT_SECRET / BETTER_AUTH_SECRET to the project)
```

Signature from the package types: `httpBasic(credentials: { username: string; password: string }, options?: { realm?: string }): AuthFn<Request>` (`eve@0.80.1` `dist/src/public/channels/auth.d.ts`). `[AU]`, `[CH]`, `[NPM]`
- `ctx.session.auth.current` / `.initiator` carry the verified principal into tools and approval policies. Route auth does not enforce session ownership. `[AU]`
- Audience: anonymous sessions are `unknown` and traces then omit content in preview/production; set `audience: "public"` on `eveChannel` for an intentionally public demo so reviewers' traces include prompts/outputs. `[CH]`, instrumentation doc https://eve.dev/docs/observability/instrumentation.md
- CORS is off by default; only needed if a browser on another origin calls the channel directly. `[CH]`

---

## 10. Deploy to Vercel `[DV]`, `[DO]`, `[CLI]`

```bash
eve link --project business-wiki-agent --non-interactive [--team <slug>]   # creates/links, pulls env to .env.local
eve deploy --non-interactive --yes [--project business-wiki-agent]        # installs deps, `vercel deploy --prod --logs`, pulls env after
curl https://<app>.vercel.app/eve/v1/health
eve remote connect --url https://<app>.vercel.app                          # TUI against the deployment
eve eval --strict --url https://<app>.vercel.app --junit .eve/junit.xml     # evals against the deployment
```

- Build output: `eve build` always writes `.eve/`; on Vercel (`VERCEL` set) it writes `.vercel/output`; elsewhere a Nitro server under `.output/`. `[DO]`, `[DV]`
- Vercel provisions from the generated output: web runtime (health/session/stream/callbacks/schedules), **Vercel Workflow** (durable runs), **Vercel Cron** (schedules), **Vercel Sandbox** (default sandbox environment on Vercel; snapshot prewarm during build; "A prewarm failure stops the deployment"). `[DV]`
- With a Next.js app: `withEve` in `next.config.ts` and the Next build command; no separate `eve build` step. Without a frontend: `eve build`. `[DV]`, `[NX]`
- `eve deploy` on a *new* project enables trace sampling so sessions show in Vercel **Observability -> Agent Runs**; `--no-trace-sampling` skips. `[DV]`
- Deployment Protection: set `VERCEL_AUTOMATION_BYPASS_SECRET` locally before `eve remote connect`/`eve eval --url`, or let the TUI add a Trusted Sources rule. `[DV]`, `[TUI]`
- Vercel CLI is not installed on this machine; `eve deploy`/`/deploy` "installs the Vercel CLI, signs in, and links the directory if needed." `[TUI]`
- Pre-production checklist from the docs: `eve build`, model credential + tool secrets in env, replace `placeholderAuth()`, workflow/sandbox match host, verify health and a real turn. `[DO]`

### Required environment variables (minimum for this project)

| Variable | Where | Why | Source |
| --- | --- | --- | --- |
| `AI_GATEWAY_API_KEY` (or project OIDC, automatic on Vercel) | local `.env.local`, Vercel project env, CI | model + judge + `auto()` approvals | `[DO]`, `[GWA]`, `[EJ]` |
| `VERCEL_OIDC_TOKEN` | pulled by `eve link`/`vercel env pull`; 12 h lifetime | alternative to the API key locally | `[CLI]`, `[GWO]` |
| `ROUTE_AUTH_BASIC_PASSWORD` or your auth secret | Vercel env | if using `httpBasic` for reviewers | `[AU]` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | local shell | only with Deployment Protection | `[DV]` |
| Trace destination keys (LangSmith/Braintrust) | Vercel env + local | per the observability ticket | instrumentation docs |
| `EVE_TRACES_CONTENT`, `EVE_TRACES*` | `.env.local` | local trace retention/content, optional | `[CLI]` |

`.env*` is gitignored by the scaffold. Route-auth secrets "never land in compiled artifacts". `[NPM]`, `[AU]`

---

## 11. Evals (import paths only; eval design is another ticket)

- `evals/evals.config.ts` (exactly one, required) with `defineEvalConfig` from `eve/evals`; evals in `evals/**/*.eval.ts` with `defineEval` (id = path). Default export an array for dataset fan-out. `[EV]`
- `t.send()`, `turn.session.send()`, `t.succeeded()`, `t.calledTool()`, `t.loadedSkill()`, `t.check(value, includes|equals|matches|similarity)` from `eve/evals/expect`, `t.score(x).label().gate()/.atLeast()`, `t.judge(criteria | question | { state, questions })`, `t.require`, `t.skip`, `t.log`. `[EV]`, `[EJ]`
- Reporters `Braintrust`, `JUnit` from `eve/evals/reporters`; loaders `loadJson`, `loadYaml` from `eve/evals/loaders`; `mockModel` from `eve/evals` for deterministic fixtures. `[API]`
- `eve eval [--strict] [--url] [--tag] [--junit path] [--json] [--verbose] [--max-concurrency 8]`; exit 0/1/2; artifacts under `.eve/evals/<timestamp>/`. `[ER]`
- Gates vs soft: `includes/equals/matches` and run-level methods gate by default; `similarity`, `t.judge`, `t.score` are soft unless `.gate()`; `--strict` fails on soft threshold misses. `[EV]`

---

## 12. Recent breaking changes and behavior shifts (0.76 -> 0.80.1) `[CL1]`, `[CL2]`

- **0.80.0**: dropped/partial trace policies now request Workflow data deletion at run end (completed transcripts unreadable; `410 session_expired`) unless `experimental.workflow.retention: "default"`. Vendored `chat` 4.42.0 (4.41 broke Workflow DevKit). Empty model responses with `finishReason: "stop"` accepted on root sessions.
- **0.80.1**: compaction keeps the head *and tail* of oversized tool results; hosted builds fail loudly on unresolved `build.externalDependencies`.
- **0.79.x**: `t.score()` added; `AssertionResult.score/threshold/passed` became optional (custom reporters: treat `passed === false` as failure). `approval.prompt` added. `ctx.approval.responder` added. `followIdle: false` option. Labeled assertions report under their bare label in Braintrust. A tool error's `name` is preserved on `tool.call.failed`. Workflow tool results are JSON-parsed; non-JSON values (`Date`, `Map`) now fail the call.
- **0.78.0**: approved calls always run as the *requester*, not the approver (security fix); catalog tools are no longer added by a dynamic resolver alone.
- **0.77.0**: eve downloads attachment links itself; `read_file` output field `image` renamed to `file` (with `pages` for PDFs); `eve/vue`/`eve/svelte` dropped some internal types; requires `ai >= 7.0.137`; model streams idle > 10 min are abandoned and retried.
- **0.76.x**: stranded-session semantics (`409 session_stranded`, `SessionStrandedError`), `modelOptions.promptCache`, `eve/tanstack`, `eve add channel/web` framework choice.
- Also note (from docs, not changelog): `agent/instrumentation.ts` was replaced by `agent/instrumentation/` in 0.62; `limits.maxSubagentDepth` no longer exists; the `TaskExec` argument and `task.postMessage` were removed; autoevals graders were removed from `t.judge`. `[SA]`, `[TO]`, `[EJ]`, instrumentation doc

---

## 13. Risks and preview gotchas for a 3-day build

1. **Node 24 is mandatory.** Confirmed by running `npx eve@latest init` on Node 22.23.2: hard exit before scaffolding. Install Node 24 via nvm before anything else. `[NPM]`, observed
2. **Judge model is a decision model, not a chat model.** `t.judge` with a plain `openai/gpt-6-luna` string does not work; use a Gateway-native decision model (`openai/gpt-6-luna-decisions`, fallback `typesafe-ai/jev`) or lose the single-credential property. Verify with one eval on day 1. Judge outputs are probabilities; pick explicit thresholds. `[EJ]`, `[CAT]`
3. **Beta surface moves weekly** (0.76 -> 0.80.1 across the last page of releases). Pin `eve` to an exact version in `package.json` and read `node_modules/eve/docs` rather than eve.dev. "On a world other than Vercel Workflow, pin the exact eve version" to avoid stranded sessions after upgrades. `[EX]`, llms.txt
4. **Stranded sessions**: any eve upgrade strands local sessions (`409 session_stranded`); `/new` in the TUI. Do not upgrade eve mid-demo. `[EX]`, `[TUI]`
5. **Wiki persistence is not free.** Tools run in the app runtime (ephemeral on Vercel Functions); the sandbox `/workspace` is per-session with no cross-session sharing; `defineState` is per-session. The wiki needs an external store or a repo-committed fixture for evals. Decide before writing tools. `[TO]`, `[SB]`, `[ST]`
6. **Replay can re-run an interrupted step.** Wiki writes must be idempotent (write-by-path is naturally idempotent; append-only `log.md` is not — key log entries by `ctx.callId` or a content hash). `[TO]`, `[EX]`
7. **Approval UX details**: a free-text follow-up that does not match an option *cancels* the pending approval; `once()` approvals are per-session; TUI shows prompts one at a time. Write evals using `session.respond`/`requireInputRequest`. `[HITL]`, `[EV]`
8. **Production route auth fails closed.** The scaffold's `placeholderAuth()` returns 401 to browsers on Vercel; choose `httpBasic`/`none()`/Sign-in-with-Vercel before the reviewer link goes out. `[AU]`, `[CH]`
9. **Trace content is hidden for anonymous/private sessions in preview/production** (metadata only) unless the channel audience is `"public"` or an explicit `tracePolicy` records inputs/outputs. Reviewers "live in LangSmith": decide audience/policy in the observability ticket. `[CH]`, instrumentation doc
10. **Vercel request body limit 4.5 MB** (base64 file ~3.3 MB): larger PDFs need `fetchFile` + external upload. `read_file` shows PDFs up to 20 MiB once they are in the sandbox. `[CH]`, `[BT]`
11. **Sandbox prewarm failures stop the deployment**; keep `agent/sandbox/workspace/` small or skip seeding. `[DV]`
12. **Default tools are powerful** (`bash`, `write_file`, `web_fetch`, `web_search`, root-copy `agent`). Set `defaultTools: false` and re-add deliberately; the prompt-injection-in-a-document eval case depends on the agent not having `web_fetch` or unrestricted `bash`. `[BT]`
13. **OIDC tokens expire after 12 h locally**; an API key avoids the refresh dance. `[GWO]`, `[GWA]`
14. **`web_search` on Gateway uses Exa and costs extra** (`web_search` pricing `10` on Sonnet 5.5 in the catalog); not needed for this agent. `[BT]`, `[CAT]`
15. **Session cost caps are available** (`limits.maxTokenCostUsdPerSession`) and worth setting during eval fan-out to bound spend. `[AC]`
16. **Deployment Protection** on Vercel previews blocks `eve remote connect`/`eve eval --url` without `VERCEL_AUTOMATION_BYPASS_SECRET`. `[DV]`
17. **The `/docs/tools/human-in-the-loop.md` URL in the ticket is a 500**; the canonical page is `/docs/human-in-the-loop.md`. The bundled package docs still use `docs/tools/human-in-the-loop.md`. `[NPM]` `docs/README.md`
18. **Vercel CLI absent locally**; `eve deploy` will install and sign in interactively, which an unattended agent cannot complete. Plan a human step (the `wizard` skill) for `vercel login` and the Gateway key.
