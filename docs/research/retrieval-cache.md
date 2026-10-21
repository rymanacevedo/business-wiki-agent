# Where the retrieval cache lives

Resolves [issue #44](https://github.com/rymanacevedo/business-wiki-agent/issues/44)
for [map #42](https://github.com/rymanacevedo/business-wiki-agent/issues/42).
Researched 2026-10-20 against this repo's code (paths are relative to the
repo root, at the commit this branch was cut from), the installed
`@vercel/blob` 2.8.2 package, and Vercel and Neon docs. Every claim names
its source. Numbers assume the deployed demo namespace: `fixtures/full`
(73 Pages: 31 summaries, 20 entities, 10 obligations, 8 expenses, Index,
Log, Profile, Schema; 98 KB of Markdown; the Index is 13 KB) plus the 34
Corpus Sources (12 `.md`, 22 `.txt`), so 107 keys under `wiki/demo/`.

## Summary

- Only `put` (upload), `copy`, `list`, and store creation count as Blob
  **advanced operations**; `get` with `useCache: false` is a cache MISS and
  counts as a **simple operation** plus Fast Origin Transfer; `head` is a
  simple operation; `del` is free. So the cap of 2,000 a month is spent by
  **writes and listings only**.
- The Blob backend issues 1 simple op per `read`, 1 advanced op per
  `write`, and 1 advanced op per `list` of the demo namespace (107 keys fit
  in one page of the default 1,000). A `--force` reseed of `fixtures/full`
  is **108 advanced ops** (1 list + 107 puts); `base` is 51.
- Today a typical Ingest spends **9 to 12 advanced ops** (2 of them are
  `list` calls inside `append_log INGEST`, 1 is the duplicate check inside
  `create_page`), a typical Query **0** (`read_index` + `read_page`), and a
  Query that falls through to `search_wiki` **1** advanced plus 73 simple.
  A demo month of 10 Ingests and 50 Queries is about **110 advanced ops**
  today, so the cap is not the pressure; reseeds (108 each) and dashboard
  browsing (counted as advanced ops) are.
- A cache under `.retrieval/` is **rejected** by the store: a path segment
  may not start with `.`. A non-dotted prefix such as `retrieval/` is
  accepted but shows up in every `list("")`; four callers would then treat
  the cache as a Page (`search_wiki`, `ingest-check.readPages`,
  `wiki-build-fixture.readNamespace`, and the `/wiki` browser by direct URL).
- Vercel Functions on Fluid compute share module-level state across
  invocations on one instance (2 GB memory on Hobby, 300 s max duration),
  but an instance is paused after its requests and cold starts "can still
  happen, such as during periods of low traffic", which is what a demo is.
  An in-process memo is a speed-up, never the source of truth.
- `@vercel/blob` 2.8.2 `list()` already returns an `etag` per blob; the
  backend discards it. One `list` call (1 advanced op) is therefore enough
  to validate a memo of the whole namespace.
- **Recommendation**: an in-process memo validated by one `list` per turn
  for the lexical section index and the Link table (about 160 advanced ops
  a month for the demo scenario, 50 of them from Queries), with embeddings,
  if they come at all, persisted in the store once per Ingest from the
  Page bodies `append_log INGEST` already reads. Neon is not a cache
  location; it stays the ADR's fallback for the whole store.

## 1. Which Blob operations count as advanced

From [Vercel Blob Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
(last updated 2026-09-23):

- "**Simple Operations**: Counts when a blob is accessed by its URL and it's
  a cache MISS, or when you retrieve blob metadata without downloading the
  blob" (that is: `get`/download on a MISS, and `head`).
- "**Advanced Operations**: Counts when you upload, copy, or list blobs, and
  when you create a Blob store" (that is: `put`, `copy`, `list`, store
  creation; multipart uploads count one per part plus start and completion).
- "Delete operations are free", "Cache HITs do not count as Simple
  Operations", and "**Dashboard interactions count as operations**: Each
  time you interact with the Vercel dashboard to browse your blob store,
  upload files, or view blob details, these actions count as Advanced
  Operations".
- Hobby includes "First 2,000" advanced operations, "First 10,000" simple
  operations, 1 GB storage and 10 GB data transfer a month; over the limit
  "you will not be able to access Vercel Blob ... you will have to wait
  until 30 days have passed". The Hobby rate limits are 20 simple ops/s and
  15 advanced ops/s ("Rate limits are based on the number of operations,
  not HTTP requests").

From [Private Storage](https://vercel.com/docs/vercel-blob/private-storage)
(last updated 2026-09-15): `get(pathname, { access: 'private', useCache: false })`
"serves the read directly from origin storage and guarantees the latest
content. These reads are slower and incur Fast Origin Transfer on each
request." Overwrites otherwise "may take up to 60 seconds to propagate".
The SDK implements `useCache: false` as a plain `GET` with `?cache=0`
(`node_modules/@vercel/blob/dist/index.js`, `get()`), so every store `read`
is a deliberate cache MISS: one simple operation and 1 to 13 KB of Fast
Origin Transfer, never an advanced operation.

The pricing page does not say whether a paginated `list` counts one
operation per call or per page; each call is one HTTP request, and the
rate-limit note counts per operation, so this note assumes one advanced
operation per `list` call (inference, flagged in Open questions).

## 2. Operations per `read`, `write`, `list` in the current backend

`packages/wiki-store/lib/blob.ts` (the `BlobClient` type names the slice it
uses: `get`, `put`, `list`, `del`; never `head` or `copy`):

| `WikiStore` call              | SDK calls                                                                        | Advanced | Simple | Notes                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read(path)`                  | 1 `get(ROOT+key, { access: "private", useCache: false })`                        | 0        | 1      | Returns `{ body, etag }`; a 404 is `null`.                                                                                                                                              |
| `write(path, body, { etag })` | 1 `put(..., { allowOverwrite: etag !== null, ifMatch, addRandomSuffix: false })` | 1        | 0      | A create-only `put` that fails with a plain `BlobError` costs one extra `get` to confirm the conflict.                                                                                  |
| `list(prefix)`                | 1 `list({ prefix })` per 1,000 keys                                              | 1        | 0      | The demo namespace has 107 keys; the default page size is 1,000 (SDK `list()` only sends `limit` when given). The backend keeps only `pathname` and drops `etag`, `size`, `uploadedAt`. |
| `remove(keys)`                | 1 `del(batch)` per 100 keys                                                      | 0        | 0      | Deletes are free; only the seed script calls it.                                                                                                                                        |

Namespacing (`store.ts`) and path checks (`paths.ts`) add no operations.
Seeding (`seed.ts`) is 1 `list` + 1 `put` per file in batches of five
("Blob's Hobby plan allows 15 writes a second"): 108 advanced ops for
`fixtures/full` + Corpus, 51 for `base`.

The local backend (`local.ts`) is files on disk: etag is `sha256(body)`,
computed on every read, and `list` walks the directory. Evals always use it
(`select.ts`: `EVE_DEV=1` forces local), so nothing in this note changes
eval cost.

## 3. Operations per tool, per Ingest, per Query today

Counted from `agent/tools/*.ts` and the helpers they call in `agent/lib/`
for the demo namespace. "adv" is advanced, "simple" is `get` reads.

| Tool                             | adv        | simple                                               | Where the operations come from                                                                                                                                                                                                                        |
| -------------------------------- | ---------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_index`                     | 0          | 1                                                    | `store.read("index.md")`                                                                                                                                                                                                                              |
| `read_page([n])`                 | 0          | n                                                    | one read per path (max 12)                                                                                                                                                                                                                            |
| `read_source(id)`                | 0          | 1 to 2 (+ up to 3 per earlier Source read this turn) | tries `.md` then `.txt`; 22 of 34 Sources are `.txt`, so usually 2                                                                                                                                                                                    |
| `list_sources`                   | 2          | 0                                                    | `sourceStatus`: `list("summaries/")` + `list("sources/")`                                                                                                                                                                                             |
| `search_wiki`                    | 1          | 73                                                   | `list("")`, then reads every non-Source path, serially                                                                                                                                                                                                |
| `create_page`                    | 2 (+1)     | 3 (+31)                                              | `read` Index, `write` Page, `editIndex` (read + write); `refuseDuplicateRecord` adds `list("summaries/")` + a read of every summary when the new Page is an Expense Record with a document number                                                     |
| `update_page`                    | 1          | 1                                                    | read, write; the duplicate check only fires when an edit turns a non-Record into a Record                                                                                                                                                             |
| `note_also_seen_in`              | k          | 1 to 2 + k                                           | Source existence check, then read and write each of k Records                                                                                                                                                                                         |
| `append_log INGEST`              | 4          | about 76                                             | Source check (1 to 2), Log, `ingestProblems` (Index, `list("")` + 70 Page reads, Log), `appendLog` (read + write), `sourceStatus` (2 lists)                                                                                                           |
| `append_log FLAG/LINT/MILESTONE` | 1          | 2                                                    | FLAG reads the flagged Page; `appendLog` read + write                                                                                                                                                                                                 |
| `change_fact`                    | n + 2 (+2) | 2n + about 75                                        | validation reads each Page (`applyChanges`), execute re-reads and writes n Pages, `appendLog`, `editIndex` when an Obligation changed, `unfinishedIngestNote` runs `ingestProblems` again; a Record going paid adds `list("obligations/")` + 10 reads |

Typical flows, following `agent/instructions.ts` (Ingest steps 1 to 6;
Query "call `read_index` first ... one `read_page` call ... `search_wiki`
only when the Index does not settle where a fact lives") and the README's
means (8.4 tool calls per Ingest, 2.1 per Query, 3.4 per Lint,
`README.md` eval table):

- **Ingest** (8 to 9 calls: `read_page(SCHEMA)`, `read_index`,
  `read_source`, `read_page([4 to 6])`, `create_page` summary,
  `update_page` Ledger, `update_page` entity, `append_log INGEST`):
  **9 advanced** (3 + 1 + 1 + 4) and about 125 simple. Each FLAG line adds
  1, `note_also_seen_in` adds 1 per Record, "ingest everything new" adds 2
  (`list_sources`), and a `change_fact` adds n + 2 to 4. Call it **10 to 12
  per Ingest**. Note that 3 of the baseline 9 are `list` calls
  (`refuseDuplicateRecord`, `readPages`, `sourceStatus`), not Page writes.
- **Query** (2 calls): **0 advanced**, 3 to 7 simple. A Query that falls
  through to `search_wiki`: 1 advanced, about 76 simple.
- **Lint** (3 to 4 calls: `read_index`, `read_page`, maybe `search_wiki`,
  `append_log LINT`): 1 to 2 advanced.
- **Wiki browser** page view (`apps/web/app/wiki/[[...path]]/page.tsx` via
  `packages/wiki-links/lib/open.ts`): 0 advanced, 1 to 2 simple.

Demo month, 10 Ingests and 50 Queries (say 10 of them reach `search_wiki`),
today: **about 110 advanced ops** and about 2,300 simple ops, plus 108
advanced per `wiki:seed --force`. The cap of 2,000 leaves room for roughly
17 reseeds at zero traffic. Simple ops (10,000) and transfer (10 GB against
a 98 KB Wiki) are not close to binding.

## 4. Is a cache under a store path compatible with the store?

**Path rules** (`packages/wiki-store/lib/paths.ts`): a segment is
`[A-Za-z0-9][A-Za-z0-9._-]*`, "A segment never starts with '.', so '..',
hidden files, and the local backend's '.tmp' directory are all
unreachable." `checkPath(".retrieval/index.json")` and
`checkPrefix(".retrieval/")` both throw `WikiPathError`. Namespaces are
stricter still (`[A-Za-z0-9][A-Za-z0-9_-]*`, no dots). So **`.retrieval/`
is not reachable through `WikiStore` at all**, by design; a cache can use a
dotted name only by going to the `Backend` directly, as `seed.ts` does for
Sources, which would make retrieval the second thing that bypasses the
store's rules.

A non-dotted prefix (`retrieval/`, `cache/`) is accepted by `checkPath`,
is writable (only `sources/` is read-only, `isSource`), and is cleared by a
`--force` reseed (`seed.ts` removes everything under the namespace). But
`list("")` returns it. Every `list` caller outside tests, and what it would
do with a cache path (`grep -rn "\.list(" agent packages apps scripts`):

| Caller                                          | Prefix                   | Effect of a cache path                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent/tools/search_wiki.ts`                    | `""`                     | **Mis-handles**: reads the cache file and keyword-searches it as a Page; a JSON index full of Page text would match every query.                                                                         |
| `agent/lib/ingest-check.ts` `readPages`         | `""`                     | **Mis-handles**: reads the cache into the Page map and runs `pageSources` and Index-line checks over it (probably no false problems, but one wasted read of the largest object in the store per Ingest). |
| `scripts/wiki-build-fixture.ts` `readNamespace` | `""`                     | **Mis-handles**: copies the cache into `fixtures/<name>/` as if it were a Page.                                                                                                                          |
| `agent/lib/eval-wiki.ts` `ensureSeeded`         | `""`                     | Harmless: only checks `length > 0`.                                                                                                                                                                      |
| `packages/wiki-store/lib/seed.ts`               | namespace                | Harmless, desirable: a reseed removes the cache.                                                                                                                                                         |
| `agent/lib/config.ts` `sourceStatus`            | `summaries/`, `sources/` | Unaffected.                                                                                                                                                                                              |
| `agent/lib/duplicates.ts`                       | `summaries/`             | Unaffected.                                                                                                                                                                                              |
| `agent/lib/proposal.ts`                         | `obligations/`           | Unaffected.                                                                                                                                                                                              |
| `apps/web` browser (`openWikiPage`)             | none (reads by path)     | Would render the cache as a Page if someone typed `/wiki/retrieval/index.json`; cosmetic.                                                                                                                |

So an in-store cache needs either a store-level rule that hides a reserved
prefix from `list` (one filter in `namespacedStore.list`, plus
`WikiReadOnlyError`-style refusal of model-named writes there), or a
sibling namespace (`demo--retrieval`; `checkNamespace` allows `-`), which
keeps `list("")` clean but is not cleared by a reseed and bends the
"namespaces are leaves" note in `packages/wiki-store/index.ts`. Either is a
small change; the sibling namespace is the only one that needs no edits to
the four callers.

Size: a lexical section index and Link table for 73 Pages is well under the
98 KB of source text. Embeddings dominate: at 1,536 float32 dimensions,
about 250 sections cost 1.5 MB raw (0.75 MB as float16, more as JSON).
Under the 512 MB cache size limit and the 1 GB Hobby store either way.

## 5. Cold start, memory, and in-process state on Vercel Functions

- Memory and duration ([Functions Limits](https://vercel.com/docs/functions/limitations),
  updated 2026-08-24): Hobby "2 GB / 1 vCPU" default and maximum; duration
  "Hobby: 300s default and maximum"; concurrency "Auto-scales up to 30,000";
  default region `iad1`; "1,024 file descriptors shared across concurrent
  executions". Clerk's session caps (`agent/agent.ts`:
  `maxInputTokensPerSession: 300_000`) are unrelated to these.
- Instance sharing ([Fluid compute](https://vercel.com/docs/fluid-compute),
  updated 2026-08-24, "Isolation boundaries and global state"): "multiple
  invocations can share the same physical instance (a global state/process)
  concurrently". [What is Compute?](https://vercel.com/docs/fundamentals/what-is-compute)
  (2026-08-11): "Functions can reuse resources across invocations, such as
  in-memory caches and established database connections".
- Instance lifetime ([Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing),
  2026-06-16): "After all requests complete, the instance is paused, and no
  CPU or memory charges apply until the next invocation." How long a paused
  instance is kept is not documented. What is Compute: Vercel "keeps
  function instances warm on production deployments" and uses bytecode
  caching, but "Cold starts can still happen, such as during periods of low
  traffic, but they're the exception". A take-home demo is low traffic.
- Hobby compute allowance (same pricing page): 4 Active CPU hours, 360
  GB-hours provisioned memory, 1 million invocations a month. Rebuilding a
  lexical index over 98 KB of Markdown is milliseconds of CPU; irrelevant.
- Eve's process model (`node_modules/eve/docs/concepts/execution-model-and-durability.mdx`):
  "Every session runs as one durable workflow ... (Vercel Workflow when you
  deploy on Vercel)"; a step "contains one model call and the inline tool
  calls that follow it"; the workflow "dispatches through the same
  Nitro-hosted workflow routes"; "The agent loop runs as a durable workflow
  in the app runtime. Model calls, tool executors, hooks ... also run there
  with full Node.js access." Each step is an HTTP dispatch, so two steps of
  one turn can run on different instances; Eve's dynamic-capabilities guide
  says of captured runtime objects that "Those values disappear on a cold
  start" (`guides/dynamic-capabilities.md`). Nothing in Eve pins a session
  to an instance.

Consequence: a module-level `Map` is cheap and safe to hold a few MB, is
shared by concurrent invocations on one instance, and is sometimes empty.
Every read of it must either validate against the store or be allowed to
be stale, and the first request after a cold start pays a full rebuild.

## 6. The Neon Postgres fallback

ADR-0001: "Neon Postgres is the fallback behind the same interface if the
Blob cap bites." The persistence research
(`docs/research/wiki-persistence.md` on branch `research/wiki-persistence`,
section 3) priced it; [Neon plans](https://neon.com/docs/introduction/plans)
today: Free plan has 100 projects, 10 branches per project, 1 GB storage
per project (20 GB total), 100 CU-hours per project per month, autoscaling
to 2 CU, "Computes suspend after 5 minutes of inactivity, and you cannot
disable this on Free", no monthly cost and no overage charges (compute is
suspended when hours run out). First paid tier is Launch at $0.106 per
CU-hour and $0.35 per GB-month.

For a retrieval cache specifically, Neon would mean: a second runtime
service and env var (`DATABASE_URL`), a scale-to-zero cold start of its own
on every first Query after five idle minutes, and Pages in Blob with their
index in Postgres, two consistency domains to keep in step. Map #42 rules
out "new runtime services". Neon only makes sense as the ADR already frames
it: the whole `WikiStore` moves there if Blob's cap bites, at which point
`list`, `write`, and a `tsvector` column are all free of the 2,000 cap and
the cache question dissolves into "a table with an index". That is a store
decision, not a retrieval decision.

## 7. The four options, with numbers

Scenario: demo month, 10 Ingests (each writes about 4 Pages: summary,
Ledger, entity, Index) and 50 Queries, every Query using retrieval as its
second rung (`read_index` first, per the map). "Baseline" is today's
non-retrieval cost from section 3 (about 100 advanced for the Ingests, 0
for Queries that no longer need `search_wiki`). Reseeds (108 each) are
excluded; add them per reseed.

| Option                                      | Where the index is                                                 | Advanced ops / Ingest                                                                                  | Advanced ops / Query                                                                | Month (10 I + 50 Q)                         | Simple ops / month                                                                                                   | Consistency                                                                                                                   | Cold start cost                                         | Embeddings                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A. Cache in the store**                   | one or more cache blobs under the namespace or a sibling namespace | baseline 10 + 1 to 4 cache puts (1 if written once at `append_log INGEST`, 1 per Page write otherwise) | 0 to 1 (1 if validated by `list`, 0 if the cache carries Page etags and is trusted) | 110 to 140 + 0 to 50 = **110 to 190**       | +50 cache reads of up to a few MB (Fast Origin Transfer: 50 x 2 MB = 100 MB of 10 GB)                                | stale between a Page write and the next cache put unless written in the same tool call; validation needs a `list` or N `get`s | 1 simple (read the cache)                               | yes, persisted                                                                                 |
| **B. Rebuild per request from Pages**       | nowhere                                                            | baseline 10                                                                                            | 1 `list` + 73 reads                                                                 | 100 + 50 = **150**                          | +3,650 (50 x 73), serially throttled under the 20 simple ops/s Hobby rate limit (about 4 s per rebuild at the limit) | always fresh                                                                                                                  | every Query is a cold start                             | **no**: 73 Pages of Gateway embedding calls per Query                                          |
| **C. In-process memo keyed by store etags** | module-level `Map<namespace, { etags, index }>`                    | baseline 10 (writes invalidate the local entry for free)                                               | 1 `list` (returns every key's etag), then reads only of changed Pages               | 100 + 50 = **150**                          | 73 per cold rebuild plus about 4 per Ingest-changed Query; 30 cold starts a month = 2,200                            | fresh to the last `list`; concurrent writers on another instance are caught by etag mismatch                                  | 1 advanced + 73 simple, lexical rebuild in milliseconds | **no** unless embeddings are also persisted (a cold start would otherwise re-embed everything) |
| **D. External store (Neon)**                | Postgres table                                                     | baseline 10 + 0 Blob (writes go to Neon)                                                               | 0 Blob                                                                              | **100** Blob, Neon well inside 100 CU-hours | unchanged                                                                                                            | two services to keep in step                                                                                                  | Neon scale-to-zero cold start after 5 idle minutes      | yes, with pgvector                                                                             |

Reading the table:

- Every option fits the cap by an order of magnitude; the cap only bites
  through reseeds and the dashboard. The real discriminators are
  consistency, cold-start latency, and whether embeddings can survive.
- B is what `search_wiki` already does, generalised; it is correct and
  simple but makes every Query wait for 73 `useCache: false` reads from
  Blob (unmeasured latency, run 0013 open question) and rules out
  embeddings.
- C costs exactly one advanced op per Query, the same as a `search_wiki`
  call today, and nothing per Ingest. Its only new requirement is that
  `Backend.list` surface the etag the SDK already returns
  (`ListBlobResultBlob.etag`, "Can be used with `ifMatch` for conditional
  writes", `node_modules/@vercel/blob/dist/index.d.ts`); the local backend
  would compute `sha256` per file in `list`, which is what it does per read
  already. The `WikiStore.list` signature (string paths) can stay; a new
  entry point (say `manifest(prefix)` returning `{ path, etag }[]`) keeps
  callers untouched.
- A is the only way to keep embeddings across cold starts without
  re-spending Gateway calls, and it is cheapest when the cache is written
  from inside `append_log INGEST`, which already holds every Page body in
  memory (`ingestProblems` reads all of them) and already costs 4 advanced
  ops; one more `put` is a 10 percent increase per Ingest. Its weak point
  is the Page-write-to-cache window and the `list("")` callers (section 4).
- D trades the Blob cap for a second service and a second cold start, and
  the map forbids it; it is the ADR's whole-store fallback, not a cache.

## Recommendation

Use **C for the lexical section index and the Link table**, and **A, written
once per Ingest, for embeddings** if and only if embeddings survive the
first scope cut.

1. **Memo** (C): one module-level `Map` per namespace holding
   `{ etags: Map<path, etag>, sections, links }`. On entry to retrieval, one
   `list` of the namespace with etags (1 advanced op; needs `Backend.list`
   or a sibling method to return the SDK's `etag`, and `sha256` in the local
   backend). Re-read only Pages whose etag changed (usually 0 to 4 simple
   ops after an Ingest), drop deleted ones, rebuild the affected sections.
   Write tools invalidate the local entry after `store.write`. A cold start
   rebuilds from 1 advanced + 73 simple ops in one burst, which must be
   throttled to 20 reads/s on Hobby (about 4 s worst case, the same cost as
   one `search_wiki` call today). Sources are excluded by prefix, as
   `search_wiki` excludes them.
2. **Embeddings** (A, only if kept): persist `{ path, etag, sectionId,
vector }` under a reserved prefix that `namespacedStore.list` hides and
   model-named writes cannot reach (or under a `demo--retrieval` sibling
   namespace), written once at the end of `append_log INGEST` from the Page
   bodies `ingestProblems` already read: **+1 advanced op per Ingest**. The
   memo loads it on a cold start (1 simple op, about 1 MB) and only embeds
   sections whose Page etag is new, so a stale cache after a reseed costs
   one full embedding pass, never wrong answers. Lexical ranking never
   waits on it: a missing or stale vector degrades that section to
   lexical-only, which is the map's stated degrade path.
3. **Do not** put the cache under `.retrieval/` (unreachable through the
   store by design) or under a bare `retrieval/` without the `list` filter
   (section 4 callers), and do not add Neon for this.

Numbers for the demo month under the recommendation: Ingests 10 x (10 + 1)
= 110, Queries 50 x 1 = 50, **about 160 advanced ops of 2,000**, versus
about 110 today; simple ops about 2,300 today + 73 per cold start, say
4,500 of 10,000 with 30 cold starts. Every `wiki:seed --force` still costs
108; budget reseeds, not Queries. With the cache in place `search_wiki`'s
own 1 + 73 pattern disappears, so Queries that used it get cheaper.

Spec-level consequences for the implementing ticket:

- `packages/wiki-store`: expose etags from `list` (both backends); hide a
  reserved cache prefix from `list` and from model-named writes, or
  document the sibling-namespace convention; a unit test that `list("")`
  never returns a cache path.
- The retrieval package owns the memo, the throttle, and the rebuild; it
  reads through `WikiStore` only, so both backends and the eval namespace
  lifecycle (`agent/lib/eval-wiki.ts` seeds per `eval/<run>/<session>`;
  the memo key must be the full namespace) work unchanged.
- Measure once, on day 1 of the build: Blob `list` and `get` latency from
  `iad1` for 73 reads with and without the 20/s throttle (the run 0013
  open question), because B versus C is a latency argument, not a cap
  argument.

## Open questions

1. Does a paginated `list` count one advanced operation per call or per
   page? The pricing page does not say; irrelevant below 1,000 keys per
   namespace, which the demo never approaches.
2. How long does a paused Fluid instance keep its module state before
   Vercel reclaims it? Undocumented; the memo's hit rate for a demo that
   gets a few requests a day is unknown until measured in the function logs
   (log a counter of memo hits versus rebuilds).
3. Do consecutive Eve Workflow steps of one turn land on the same function
   instance often enough for the memo to help within a turn? Eve's docs
   describe steps as HTTP dispatches through Nitro routes and make no
   affinity promise. Same measurement as 2.
4. What the AI Gateway offers for embeddings and its per-call price decide
   whether item 2 of the recommendation exists at all (the map's Gateway
   research ticket).
5. Whether the retrieval seam should sit at `Backend.list` (etags for all
   callers) or a new `WikiStore` method (`manifest`), and whether a hidden
   cache prefix or a sibling namespace is the cleaner rule; a
   `codebase-design` question for the seam ticket, not a cost question.
6. Whether `ingestProblems` and the memo should share one "read every
   Page" code path, so an Ingest's INGEST line and the cache refresh cost
   one pass instead of two (today `append_log INGEST` and a following
   `change_fact` each run it).
