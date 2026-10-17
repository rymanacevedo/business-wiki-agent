# Where the wiki can live: Eve sandbox, memory providers, and persistence on Vercel

Resolves issue #5. Researched 2026-10-17 against primary sources only (eve.dev docs, the `vercel/eve` source on GitHub, and Vercel/Neon/Upstash docs). Every claim links to the page or file it came from. Source files are cited by repo path at `https://github.com/vercel/eve/blob/main/<path>`.

The question: the agent maintains a directory of Markdown pages plus `index.md` and `log.md` across many sessions (Karpathy's LLM-wiki pattern: the LLM owns the wiki, reads `index.md` first, appends to `log.md`, and a single ingest "might touch 10-15 wiki pages" [[gist]](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)). Where can that directory persist in an Eve app, locally and on Vercel, within a 3-day build?

## TL;DR

- **The Eve sandbox is per-session.** "Built-in environments do not expose cross-session sharing." Files in `/workspace` survive turns, restarts and redeploys *within one session*, and eve deletes the Vercel sandbox (with its orphan snapshots) when the session ends. It is not a cross-session wiki store. [[sandbox]](https://eve.dev/docs/sandbox.md) [[vercel-lifecycle.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/bindings/vercel-lifecycle.ts)
- **Built-in `read_file` / `write_file` / `glob` / `grep` all operate on the sandbox** (`ctx.getSandbox()`, default path `/workspace`). They would work as wiki tools only if the wiki lived in the sandbox, which brings the per-session limit above. [[read-file.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/tools/provided/read-file.ts) [[glob-tool.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/glob-tool.ts)
- **The file memory provider is a single bounded document per scope** (65,536-byte document, 2,048-byte entries, 4,000-character recall), stored in Vercel Blob on Vercel and in process memory under `eve dev`. Unsuitable for a multi-page wiki. [[memory/file]](https://eve.dev/docs/memory/file.md)
- **`defineState` is per-session durable state**, "never shared with subagents". Not a wiki store. [[state]](https://eve.dev/docs/concepts/state.md)
- **Vercel Functions have a read-only filesystem with a 500 MB `/tmp` scratch space**; nothing there is shared or durable. [[runtimes]](https://vercel.com/docs/functions/runtimes)
- **Recommendation for 3 days: Design A.** Authored wiki tools in the app runtime over a tiny `WikiStore` interface with two backends: a local directory in `eve dev`/`eve eval`, and a private **Vercel Blob** store on Vercel (`allowOverwrite`, `ifMatch` optimistic concurrency, `useCache: false` consistent reads). Evals get a fresh wiki per run by namespacing the store under a per-run key set in `evals.config.ts` `setup()` and seeding from `evals/data/wiki-seed/`. Neon Postgres is the drop-in swap if Hobby Blob operation quotas bite.

## 1. Eve sandbox: filesystem lifecycle, persistence, sharing, network

Source: [eve.dev/docs/sandbox](https://eve.dev/docs/sandbox.md) unless noted.

**Layout.** Each agent has one sandbox rooted at `/workspace`; relative paths resolve under it. Skills are exposed at `$HOME/.agents/skills`; inbound attachments land in `/workspace/.eve/attachments/`. "Files under `agent/sandbox/workspace/` seed writable `/workspace`" when eve prepares a new environment generation, and "Existing live sandbox state is not overwritten by later seed changes." The agent-files reference says the same: `sandbox/workspace/**` is "Mirrored into `/workspace/` when a session starts." [[agent-files]](https://eve.dev/docs/reference/agent-files.md)

**Lifecycle.** `environment.open()` inside `defineSandbox()` "starts the persistent sandbox owned by the current session"; eve checkpoints the provider state after initialization succeeds, and "Later workflow steps and process restarts call the provider's `resume()` directly". `sandbox.stop()` stops compute but keeps state; `sandbox.delete()` clears provider state so the next `ctx.getSandbox()` starts fresh. "When the durable session reaches a terminal outcome, eve calls `onSessionEnd()` so the provider can release remaining resources." Sessions persist "across turns and deployments while their provider state remains available." The execution-model page adds that "The sandbox owns the per-session filesystem and processes." [[execution-model]](https://eve.dev/docs/concepts/execution-model-and-durability.md)

**Per-session, not shared.** Sandboxes are per-session; "Built-in environments do not expose cross-session sharing." Custom providers may reuse native resources across sessions, but the docs warn that a session-specific path "is not an isolation boundary." A subagent can share its parent's sandbox via `defineParentSandbox()`.

**Generations.** Changing sandbox source, preparation code, Dockerfile, options, workspace resources, or skills creates a new generation; "Existing durable sessions keep their recorded state." Reusable artifacts come from `prepare`: "Vercel captures a snapshot; Docker captures an image; microsandbox captures a VM snapshot; and just-bash captures a filesystem template."

**Handle API.** Authored tools "run in your app runtime with full access to `process.env`, not in the sandbox"; `ctx.getSandbox()` returns "the live sandbox handle". [[tools]](https://eve.dev/docs/tools.md) The public `SandboxSession` interface picks `run`, `spawn`, `readFile`, `readBinaryFile`, `readTextFile`, `writeFile`, `writeBinaryFile`, `writeTextFile` from the AI SDK's `Experimental_SandboxSession`, plus eve's `resolvePath` and `removePath`; "Relative paths resolve from `/workspace`". The runtime handle adds `stop()` and `delete()`. [[shared/sandbox-session.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/shared/sandbox-session.ts) The docs' example is `sandbox.writeTextFile({ path, content })` then `sandbox.run({ command })`.

**Network policy.** Vercel supports `networkPolicy: "deny-all"` on `open()` and `sandbox.setNetworkPolicy("deny-all")` after; the Vercel allow-list maps hosts to entries with header transforms so "the secret does not enter the sandbox process". Docker supports only `"allow-all" | "deny-all"`. just-bash "provides no network isolation" and does not expose `setNetworkPolicy()`. [[sandbox/vercel]](https://eve.dev/docs/sandbox/vercel.md) [[sandbox/docker]](https://eve.dev/docs/sandbox/docker.md) [[sandbox/just-bash]](https://eve.dev/docs/sandbox/just-bash.md)

**Local vs Vercel.**
- `DefaultSandbox`: "On Vercel, it selects Vercel Sandbox"; elsewhere it tries Docker, microsandbox, and just-bash "in that order, according to host support." [[sandbox/default]](https://eve.dev/docs/sandbox/default.md) (The dev machine has Docker, per the map.)
- Docker: "A session-owned container keeps writable `/workspace` state in its container filesystem. A stopped container restarts with that state." On `eve dev` shutdown eve *stops* (does not remove) the dev run's containers. [[sandbox/docker]](https://eve.dev/docs/sandbox/docker.md) [[development-cleanup.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/development-cleanup.ts)
- just-bash: each session's root is a directory copied from the template under `<cache>/<provider>/sessions/<sessionKey>`; templates live under `.eve/sandbox-cache/local/templates/`. "The roots are local files". [[local-provider-utils.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/bindings/local-provider-utils.ts) [[just-bash.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/bindings/just-bash.ts) [[cli]](https://eve.dev/docs/reference/cli.md)
- During `eve dev`, environments are prepared on first sandbox access; `eve build` prepares eagerly and "Production runtime does not rebuild or repair a missing artifact." On Vercel, "During a Vercel build, eve creates or reuses a snapshot-backed template" and "A prewarm failure stops the deployment." [[deployment/vercel]](https://eve.dev/docs/guides/deployment/vercel.md)
- Vercel provider: build creates a temporary persistent sandbox, writes workspace and skill files, runs `prepare`, captures a snapshot; "The build artifact records the snapshot ID" and each missing session sandbox is created from it. The session's sandbox `name` "stays stable across stop/resume". `persistent`, `name`, `onResume` are "Framework-injected fields" authors cannot override. At session end eve runs `stop()` then `Sandbox.get({ name, resume: false })` and `delete({ deleteOrphanSnapshots: true })`. [[sandbox/vercel]](https://eve.dev/docs/sandbox/vercel.md) [[public/sandbox/vercel-sandbox.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/public/sandbox/vercel-sandbox.ts) [[vercel-lifecycle.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/bindings/vercel-lifecycle.ts)

**Vercel Sandbox platform facts** relevant to a per-session wiki: "Persistence is the default"; on stop the filesystem is snapshotted automatically and resume starts "a new session from the last saved state". Hobby quotas: 5 Active CPU hours/month, 10 concurrent sandboxes, **45-minute max session duration** (resets on resume), 15 GB lifetime snapshot storage, 64 GB disk; Pro: 24-hour sessions, $0.128/Active-CPU-hour, $0.08/GB-month snapshots. Snapshots expire 30 days after last use by default. [[persistent-sandboxes]](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes) [[sandbox pricing]](https://vercel.com/docs/sandbox/pricing) [[snapshots]](https://vercel.com/docs/sandbox/concepts/snapshots)

**Drives (cross-sandbox storage).** A Drive "stores files independently of a sandbox"; eve exposes it through `environment.open({ mounts: { "/data": drive } })` after `Drive.getOrCreate({ name, region })`. Constraint: "A Drive supports one active read-write mount"; "Each eve session gets its own sandbox, so a fixed name only works when one session uses the Drive at a time." Read-only sharing goes through `drive.snapshot()`. Vercel's docs: one read-write mount, many read-only snapshot mounts, up to four mounts, 1 GiB default on Hobby, $0.05/GB-month plus reads/writes, "Persists until manually deleted". Drives exist only for Vercel Sandbox; Docker/just-bash have no equivalent, so local dev needs a different path. [[sandbox/vercel]](https://eve.dev/docs/sandbox/vercel.md) [[drives]](https://vercel.com/docs/sandbox/concepts/drives)

## 2. Eve memory: what the file provider stores

Sources: [memory](https://eve.dev/docs/memory.md), [memory/file](https://eve.dev/docs/memory/file.md), [memory/custom-provider](https://eve.dev/docs/memory/custom-provider.md), and the provider source.

- Memory "gives an agent context that outlives a session." Each turn the provider's `recall` runs and "Recalled content enters model context as user-role messages attributed to the slot, never as system instructions."
- `fileMemory()` "keeps one bounded document per scope" with no automatic extraction; the model uses `<slot>__save_memory` and `<slot>__remove_memory`.
- **Limits** (docs, confirmed in source constants `DEFAULT_MAX_CHARACTERS = 4_000`, `MAX_DOCUMENT_BYTES = 65_536`, `MAX_ENTRY_BYTES = 2_048`): recalled message 4,000 characters by default, one entry 2,048 UTF-8 bytes, stored document 65,536 bytes. Over-limit writes "are rejected, not truncated". Concurrent writes use optimistic versioning (`MAX_CONFLICT_RETRIES = 8`). [[provider.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/public/memory/file/provider.ts)
- **Backends.** Without an explicit `backend`: on Vercel with Blob credentials, private Vercel Blob at `<prefix>/<scope key>/MEMORY.md` (default prefix `eve/memory/file`); on Vercel without Blob, an error; in `eve dev`, "shared process-local in-memory storage"; elsewhere, an error. Credential order: `EVE_MEMORY_BLOB_STORE_ID` + OIDC, `EVE_MEMORY_BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` + OIDC, `BLOB_READ_WRITE_TOKEN`. Source: `isDeployedOnVercel()` is `process.env.VERCEL`; `isEveDevelopment()` is `process.env.EVE_DEV === "1"`. [[backends/default.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/public/memory/file/backends/default.ts) [[dev-environment.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/internal/application/dev-environment.ts)
- A custom backend implements `MemoryDocumentBackend` with `read` and `write`, where `write()` replaces the full document and must throw `MemoryDocumentConflictError` on version mismatch. A custom *provider* (`defineMemoryProvider`) gets `recall` / `capture` / `tools` surfaces and a locked `memory.scope.key`; "eve does not truncate or expire provider content, so the provider must enforce its own size and retention policies."
- Scopes: `byPrincipal` keys by the authenticated caller; "In local development, `byPrincipal` returns the shared `local-dev` scope." Namespaces differ per environment (production = project+environment, preview adds branch/deployment, local = digest of the application root).

**Verdict.** The file provider is one 64 KB document with a 4,000-character recall budget, flat entries, and no file-level addressing. A wiki of hundreds of pages, an index, and an append-only log does not fit. The custom-provider interface is for prompt-time recall/capture, not a file API the model can `read`/`write` by path. Memory is the wrong primitive for the wiki; it could at most hold a pointer ("business id = X") per caller.

## 3. Durable state (`defineState`)

"A typed, named slot of durable per-session memory for an agent." Values "survive workflow step boundaries, so they outlast crashes, redeploys, and days-long sessions", "State is durable by default and does not reset between turns", and `defineState` values "never cross the parent/child boundary, even when the child is a copy of the same agent." No size limit is documented. It is session-scoped only; it points readers to memory providers for anything that must outlive a session. [[state]](https://eve.dev/docs/concepts/state.md)

Useful for: a per-session "wiki namespace" or "pages touched this session" counter. Not a wiki store.

## 4. Built-in tools: do `read_file`, `write_file`, `glob`, `grep` hit the sandbox?

Yes, all four. Docs: `read_file` "reads text files from the sandbox", "accepts absolute paths and paths beginning with `$HOME/`"; `write_file` "writes complete files in the sandbox, with read-before-write and stale-read checks"; `glob` "finds sandbox files by glob pattern"; `grep` "searches sandbox file contents with a regular expression". `glob`/`grep` are opt-in (`eve add tool/glob`, `eve add tool/grep`); `read_file`/`write_file`/`bash` are defaults, disabled per-file with `disableTool()` or wholesale with `defaultTools: false`. Each default lives at `agent/tools/<name>.ts` and an authored file replaces it. [[built-in-tools]](https://eve.dev/docs/concepts/built-in-tools.md)

Source confirms the executors: each is a "Framework-owned executor that delegates to the default sandbox" calling `execute*OnSandbox(await ctx.getSandbox(), input)`. `glob` and `grep` default to `/workspace` and shell out via `sandbox.run()` to `rg --files` / `rg` when ripgrep is available, falling back to POSIX `find` / `grep -rn`. [[glob.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/tools/provided/glob.ts) [[grep.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/tools/provided/grep.ts) [[glob-tool.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/glob-tool.ts) [[grep-tool.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/execution/sandbox/grep-tool.ts) [[write-file.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/tools/provided/write-file.ts)

Could they serve as wiki tools directly? Only in Design B (wiki in `/workspace`). They have no approval gate by default ("Review these tools before production use"), no wiki-specific validation (schema, index/log invariants), and inherit the sandbox's per-session lifetime. For the take-home, authored `wiki_*` tools with `approval` on writes are the consequential-action surface the brief wants, regardless of backend.

## 5. Vercel options for a shared, writable document store reachable from the app runtime

The Eve app runtime on Vercel is Vercel Functions plus Vercel Workflow ("persists and resumes durable runs") [[deployment/vercel]](https://eve.dev/docs/guides/deployment/vercel.md). Functions have "a read-only filesystem with writable `/tmp` scratch space up to 500 MB" and are archived when idle, so the wiki must live in an external store. [[runtimes]](https://vercel.com/docs/functions/runtimes)

| Option | Fit for Markdown pages | Consistency / concurrency | Cost (Hobby → Pro) | Latency notes | Local dev |
|---|---|---|---|---|---|
| **Vercel Blob (private store)** [[blob]](https://vercel.com/docs/vercel-blob) [[sdk]](https://vercel.com/docs/vercel-blob/using-blob-sdk) [[pricing]](https://vercel.com/docs/vercel-blob/usage-and-pricing) | Natural: `put('wiki/<ns>/pages/x.md')`, `get()`, `list({ prefix })` (lexicographic), folders via `/`; max 5 TB/file | Overwrite needs `allowOverwrite: true`; CDN cache means overwrites "may take up to 60 seconds to propagate" unless you read with `get(path, { access: 'private', useCache: false })` ("guarantees the latest content", costs Fast Origin Transfer); `ifMatch` ETag gives optimistic concurrency (`BlobPreconditionFailedError`); S3-backed, 11 nines durability | Hobby: 1 GB, 10,000 simple ops (metadata/cache-miss reads), **2,000 advanced ops** (put/copy/list) per month, then access is cut until 30 days pass. Pro: $0.023/GB, $0.40/1M simple, $5/1M advanced. Deletes free. Rate limit Hobby 15 writes/s | No published numbers; stores in 19 regions, pick one near `iad1` functions; private reads go store→Function→client | OIDC via `vercel env pull` (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`, dev tokens expire in 12 h and auto-refresh) or `BLOB_READ_WRITE_TOKEN`; or a local-directory backend |
| **Postgres (Neon via Marketplace)** [[postgres]](https://vercel.com/docs/postgres) [[neon-vercel]](https://neon.com/docs/guides/vercel-managed-integration) [[plans]](https://neon.com/docs/introduction/plans) [[driver]](https://neon.com/docs/serverless/serverless-driver) | Table `pages(ns, path, content, etag, updated_at)` + `log(ns, ts, entry)`; full-text search free with `tsvector`/`ILIKE` | Transactions, row-level optimistic locking, strong consistency | "Vercel Postgres is no longer available" (moved to Neon Dec 2024). Neon Free: 100 projects, 1 GB/project, 100 CU-hours/project/month, autosuspend after 5 min (cannot disable). Launch: $0.106/CU-hour, $0.35/GB-month | `@neondatabase/serverless` over HTTP is "the fastest option for single queries"; scale-to-zero cold starts on Free | Integration injects `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `PG*`, legacy `POSTGRES_*`; preview branching optional; local uses the same URL or a local Postgres |
| **Redis (Upstash via Marketplace)** [[redis]](https://vercel.com/docs/redis) [[upstash pricing]](https://upstash.com/docs/redis/overall/pricing) [[integration]](https://upstash.com/docs/redis/howto/vercelintegration) | Hash per page or key per path; no path listing without `SCAN`/index set; 100 MB max record | Atomic commands, `WATCH`/Lua for CAS | "Vercel KV is no longer available" (moved to Upstash). Free: 250 MB, 500K commands/month, 10 GB bandwidth; PAYG $0.20/100K commands; first fixed plan $10/mo | REST client (`Redis.fromEnv()`), stateless per request; no numbers published on the fetched pages | Env vars injected by integration; redeploy required |
| **Vercel Sandbox Drive** [[drives]](https://vercel.com/docs/sandbox/concepts/drives) | A real directory the sandbox mounts; built-in file tools work on it | **One read-write mount at a time**; readers use point-in-time snapshots | Hobby 1 GiB default, 15 GB lifetime; Pro $0.05/GB-month + $0.0015/GB reads + $0.004/GB writes | NVMe writes, cached reads | **No local equivalent** (Docker/just-bash cannot mount Drives) |
| **Vercel Sandbox snapshot (per session)** | Built-in tools work | Independent copy per sandbox; "changes are not shared" | Snapshot storage $0.08/GB-month; Hobby 15 GB lifetime | n/a | Docker container / just-bash directory |
| **Functions `/tmp`** | n/a | Per-instance, ephemeral | free | fast | n/a |

## 6. How evals get a fresh, seeded wiki per run

Facts from [evals/overview](https://eve.dev/docs/evals/overview.md), [evals](https://eve.dev/docs/evals.md), [evals/targets](https://eve.dev/docs/evals/targets.md), [evals/tool-stubs](https://eve.dev/docs/evals/tool-stubs.md), [evals/cases](https://eve.dev/docs/evals/cases.md), [cli](https://eve.dev/docs/reference/cli.md), and the runner source:

- `evals.config.ts` `setup()` "runs once per `eve eval` invocation, after discovery and config loading, before target startup" and may return context; `teardown(context)` runs "after the local server and its sandbox handles shut down, including after setup, startup, or eval failures." Context "stays in the runner process" and is "neither serialized nor sent to the agent server." "Concurrent evals share these resources, so isolate any database records they modify." Per-eval `timeoutMs` does not apply to setup/teardown; default `--max-concurrency` is 8.
- "`eve eval` starts a local dev server, while `eve eval --url <url>` runs against an existing server or deployment." Source: without `--url` the CLI sets `EVE_EVALUATION=1` and a random `EVE_EVALUATION_RUN_ID`, then calls `createDevelopmentServer(appRoot, { host: "127.0.0.1", port: 0 })` in the same process; that function sets `process.env.EVE_DEV ??= "1"`. [[cli/eval.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/evals/cli/eval.ts) [[start-development-server.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/internal/nitro/host/start-development-server.ts) (`EVE_EVALUATION*` are internal flags, not documented; do not depend on them.)
- "every eval creates fresh sessions from it" (the shared client); `t.send()` creates a session with its first message, `t.session()` an empty one. Each new session gets its own sandbox (section 1), seeded from `agent/sandbox/workspace/`. Eval sessions are only `reset()` on timeout; otherwise the runner leaves them. [[execute-eval.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/execute-eval.ts) [[execute-task.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/evals/runner/execute-task.ts) [[session.ts]](https://github.com/vercel/eve/blob/main/packages/eve/src/evals/session.ts)
- Tool stubs are declared per session (`t.session({ stubs })`): a matched call "returns the stubbed JSON instead of running the tool"; unmatched calls run the real tool. Stubs cannot register new tools.
- Dataset fan-out: a file default-exports an array of `defineEval(...)`; `loadJson`/`loadYaml` from `eve/evals/loaders` read fixtures under `evals/data/`.
- **Memory caveat.** Because the eval server runs with `EVE_DEV=1`, `fileMemory()` without an explicit backend uses the "shared process-local in-memory" backend, and `byPrincipal` resolves to the shared `local-dev` scope, so every eval in a run would read and write the same memory document. eve's own e2e fixture pins `backend: inMemory()` off-Vercel and scopes by deployment id. If a memory slot is used at all, scope it per session during evals. [[e2e fixture]](https://github.com/vercel/eve/blob/main/e2e/fixtures/agent-memory/agent/memory/file.ts)

Implication: a fresh wiki per eval falls out naturally if (a) the wiki is in the sandbox (fresh sandbox per session, seeded from `agent/sandbox/workspace/`), or (b) the wiki store is namespaced per run/session and seeded by `setup()` or lazily by the tools. Against `--url` (a deployment), `setup()` cannot reach the deployment's environment, so namespacing must be derivable inside the tool (from the session or caller), or the eval must seed through an authored seeding tool/route.

## Designs

### Design A (recommended): app-runtime `WikiStore` with local-directory and Vercel Blob backends

**What the tools read/write.** Authored tools in `agent/tools/`: `wiki_index` (returns `index.md`), `wiki_read(path)`, `wiki_search(query)` (runtime substring/regex over listed pages; the wiki is "~hundreds of pages" at most), `wiki_write(path, content, expectedEtag)` with `approval`, `wiki_log_append(entry)`. All go through one interface:

```ts
interface WikiStore {
  read(path): Promise<{ content: string; etag: string } | null>;
  write(path, content, opts?: { ifMatch?: string }): Promise<{ etag: string }>;
  list(prefix?): Promise<string[]>;
  remove(path): Promise<void>;
}
```

Backends: `LocalDirStore(rootDir)` using `node:fs` (dev/evals; tools "run in your app runtime with full access to `process.env`"), and `BlobStore(prefix)` using `@vercel/blob` `get(..., { access: 'private', useCache: false })`, `put(..., { access: 'private', allowOverwrite: true, ifMatch })`, `list({ prefix })`, `del`. Selection: `process.env.VERCEL` → Blob (OIDC via `BLOB_STORE_ID`), else local dir. Raw documents (receipts, PDFs) are immutable and go to Blob with `addRandomSuffix: true`, or into the sandbox `/workspace/.eve/attachments/` when sent as attachments.

**Keying.** Every path is prefixed by a namespace: `wiki/<ns>/pages/...`, `wiki/<ns>/index.md`, `wiki/<ns>/log.md`. `ns` comes from `ctx.session.auth.current?.principalId` when auth exists, otherwise from `process.env.WIKI_NAMESPACE`, defaulting to `default`. (Never from model input, per the multi-tenant memory pattern: "Never accept the tenant or user ID from the model." [[multi-tenant-memory]](https://eve.dev/docs/patterns/multi-tenant-memory.md))

**Seeding.** A checked-in `seed/wiki/` (schema page, empty `index.md`, `log.md`, a few starter pages) and a script `pnpm wiki:seed [--ns X]` that copies it into the active backend. The dev `WIKI_DIR` (e.g. `.wiki/`, git-ignored) is seeded on first run.

**Evals.** `setup()` in `evals.config.ts` generates `runId`, sets `process.env.WIKI_NAMESPACE = "eval/<runId>"` before the in-process target starts (so tools see it) and seeds the namespace from `evals/data/wiki-seed/`; returns `{ runId, store }` as context so eval bodies can assert on the resulting files (`t.check(await store.read('index.md'), includes(...))`). `teardown` removes the prefix (`list` + `del`; deletes are free on Blob). For isolation at `--max-concurrency 8`, sub-namespace per session (`eval/<runId>/<sessionId>`) with lazy copy-on-first-access from the run seed; otherwise run write-heavy evals with `--max-concurrency 1`. Against `--url`, seeding must go through the tool's lazy-seed path or an authored `wiki_reset` dev-only tool.

**Local vs Vercel.** Identical tool code; only the backend differs. Local store is plain files you can `cat` and diff in the demo. On Vercel, Blob is the same product eve itself uses for file memory, provisioned with `vercel blob create-store --access private --yes` and connected via OIDC.

**Trade-offs.**
- (+) Decoupled from sandbox lifetime; survives sessions, redeploys, and the 30-day session timeout. Works on Hobby. Built-in file tools can stay disabled or be left for raw-document inspection in the sandbox.
- (+) Fresh-per-run evals are a namespace, not infrastructure.
- (-) Hobby Blob quota: 2,000 advanced ops/month. One ingest touching ~15 pages + index + log is ~17 `put`s; a 30-case eval suite run five times is well over 2,000. Mitigations: run evals against the local backend (default `eve eval`), keep `list()` calls out of hot paths (read `index.md` instead), batch log appends per turn. If still tight, swap `BlobStore` for `NeonStore` (same interface; Free tier 100 CU-hours).
- (-) Blob reads for latest content must use `useCache: false` (slower, origin transfer); overwritten pages otherwise lag up to 60 s.
- (-) `grep` is reimplemented in the runtime; fine at this scale, would not scale to GBs.

### Design B: wiki in the sandbox `/workspace`, built-in tools as wiki tools

**Tools.** Enable `glob`/`grep` (`eve add tool/glob`, `eve add tool/grep`); wrap `write_file` in `agent/tools/write_file.ts` with `defineTool({ ...writeFile, approval })` for the approval gate. The model reads `/workspace/wiki/index.md` first.

**Seeding.** `agent/sandbox/workspace/wiki/**` is mirrored into `/workspace` when a session starts.

**Evals.** Free: every eval session gets a fresh sandbox from the prepared template, already seeded. Assert via `t.calledTool("write_file", ...)` and transcript, or `sandbox.readTextFile` from an authored "inspect" tool.

**Local vs Vercel.** Local: Docker container per session (state survives container stop); Vercel: persistent sandbox per session from the build snapshot.

**Trade-offs.**
- (+) Zero storage code; eve's own file tools; perfect per-eval isolation.
- (-) **No cross-session wiki.** The map's requirement is "across many sessions". The only way to persist is to keep one session alive (default `sessionTimeoutMs` 30 days, `false` disables) and route every user turn to that session id; eve deletes the Vercel sandbox and orphan snapshots when the session ends. Hobby caps a sandbox VM session at 45 minutes (auto-resume on next access) and 10 concurrent sandboxes.
- (-) Wiki state is invisible outside the sandbox (no `cat` from the host on Vercel), and a new generation (any change to workspace seed, skills, or sandbox options) does not update live sessions.
- (-) Snapshot storage accrues per session on Vercel ($0.08/GB-month; 15 GB lifetime on Hobby).

### Design C: sandbox working copy synced to durable storage (Blob or Drive)

**Tools.** Built-in file tools on `/workspace/wiki`, plus hooks: `turn.started` pulls the namespace from Blob into `/workspace/wiki` (via `ctx.getSandbox().writeTextFile`), `turn.completed` pushes changed files back (`readTextFile` + `put`). Or on Vercel mount a Drive at `/wiki` with `environment.open({ mounts })`.

**Trade-offs.**
- (+) Model gets a real filesystem and `rg`; durable across sessions.
- (-) Two sources of truth; conflict handling between concurrent sessions is on you; every turn pays a full pull/push (Blob advanced ops) or a Drive mount that permits only one read-write session at a time and has no local analogue. Hooks docs exist ([hooks](https://eve.dev/docs/guides/hooks.md)) but this is the most code and the most failure modes for a 3-day build.

## Recommendation for the 3-day build

Build **Design A**. Day 1: `WikiStore` with `LocalDirStore` + the five `wiki_*` tools + seed script; `eve dev` works end to end on disk. Day 2: `BlobStore` behind `process.env.VERCEL`, `vercel blob create-store --access private --yes`, `eve deploy`; evals with `setup()`/`teardown()` namespacing against the local target. Day 3: evals, judge, before/after. Keep the Eve sandbox for what it is good at (raw-document attachments, `bash` for PDF-to-text if needed) and leave `write_file`/`bash` disabled or approval-gated so the only consequential writes are `wiki_write` and `wiki_log_append`.

Decisions this unblocks for #10 and #11: wiki tools are authored (not built-ins); wiki paths are namespaced; eval fixtures live in `evals/data/wiki-seed/`; the file memory provider is not used for wiki content; Neon is the documented fallback if Blob Hobby quotas are exceeded.

## Open questions

- Whether `createDevelopmentServer` runs the Nitro host in-process or forks: the CLI calls it directly after `setup()`, so env set in `setup()` is inherited either way, but confirm with a smoke test on day 2 before relying on it.
- Actual Blob read/write latency from `iad1` functions is not published; measure once during day 2.
- Hobby vs Pro for the submission account: Pro removes the 2,000-advanced-op and 45-minute-sandbox-session limits.
