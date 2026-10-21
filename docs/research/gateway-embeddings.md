# Embeddings through the Vercel AI Gateway from a Clerk tool

Resolves issue #43 (map #42). Researched 2026-10-20 against primary sources only: the packages installed in `node_modules` (`eve@0.80.1`, `ai@7.0.143`, `@ai-sdk/gateway@4.0.116`), the Eve docs shipped under `node_modules/eve/docs/`, the Vercel AI Gateway, Vercel Blob and AI SDK docs, the OpenAI embeddings guide, and one live probe against the Gateway with this project's `AI_GATEWAY_API_KEY`. Installed files are cited by path under `node_modules/`.

The question: which embedding models does the Gateway expose to this key, and how does Clerk call one from a tool or a write path outside a model turn? Needed: model ids, dimensions, price, rate limits; whether `embed`/`embedMany` work with the Gateway in the pinned versions; any Eve helper; latency per Page; cost for 74 Pages once and one Page per write; anything that makes the embedding rung infeasible.

## TL;DR

- **It works today, with no new dependency.** `embed({ model: "openai/text-embedding-3-small", value })` from the already-installed `ai@7.0.143` resolves the string id through the Gateway using `AI_GATEWAY_API_KEY`. The live probe returned a 1,536-dimension vector in 380 to 435 ms warm (1,023 ms cold) for a 1 KB string, `usage.tokens: 267`, Gateway-reported cost $0.00000534. [[probe]](#7-live-probe)
- **Eve offers no embedding helper and does not get in the way.** The Eve docs never mention embeddings; Eve's public entry points list no embedding API; Eve reads `globalThis.AI_SDK_DEFAULT_PROVIDER` but never assigns it, so the `ai` default provider inside a tool is still the Gateway. A Clerk tool, the seed script, or the Lint skill imports `embed` from `ai` and nothing from `eve`. [[§3]](#3-what-eve-adds-nothing)
- **28 embedding models** are typed in the installed Gateway provider and listed in the catalog. The sensible pair for Clerk: `openai/text-embedding-3-small` (1,536 dims, $0.02 per 1M input tokens, 8,192-token input ceiling) and `openai/text-embedding-3-large` (3,072 dims, $0.13 per 1M). Both accept the AI SDK's top-level `dimensions` to shorten vectors; the probe got 512 dims back when asked. [[§2]](#2-models-dimensions-and-prices)
- **Cost is noise.** The `fixtures/full` Pages are about 86 KB, which the probe's ratio (3.98 bytes per token) makes about 22K tokens: **$0.0004 to embed every Page once** with `-3-small` ($0.003 with `-3-large`). A median Page (856 bytes, about 215 tokens) re-embeds for $0.000004; the largest Page (`index.md`, 13 KB, about 3,300 tokens) for $0.00007. A query embedding costs less than a millionth of a dollar. [[§5]](#5-cost-to-embed-the-wiki)
- **Rate limits:** none from the Gateway on the paid tier; "lower limit per model" on the free tier, numbers unpublished; `429` with optional `retry-after`, and the AI SDK retries twice by default. The probe ran on Gateway system credentials and succeeded, so the model is reachable from this key. [[§2.3]](#23-rate-limits)
- **Nothing makes the rung infeasible.** The soft costs are one extra Blob advanced operation per Page write (2,000 a month on Hobby), 0.4 to 1 s added to each write tool call and each `search_wiki` call, no offline mode (so `eve eval` without network must fall to lexical-only), and vectors that must be tagged with the model id and dimension count so a model change invalidates the cache instead of silently ranking against stale vectors. [[§6]](#6-what-could-make-the-embedding-rung-infeasible)

## 1. What is installed

| Package           | Version         | Where it comes from                                                                                                                                                       |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eve`             | 0.80.1 (pinned) | `package.json` dependency; `eve/package.json` lists `ai: ^7.0.137` as a **peer dependency**, and `nitro` and `undici` as its only hard dependencies                       |
| `ai`              | 7.0.143         | `package.json` `^7.0.137`; `bun.lock` resolves it to 7.0.143 with hard dependencies `@ai-sdk/gateway@4.0.116`, `@ai-sdk/provider@4.0.29`, `@ai-sdk/provider-utils@5.0.62` |
| `@ai-sdk/gateway` | 4.0.116         | transitive, via `ai`; **not** a direct dependency of this repo                                                                                                            |

Eve vendors its own compiled copies of `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/otel`, `@ai-sdk/provider` and `@ai-sdk/provider-utils` under `node_modules/eve/dist/src/compiled/@ai-sdk/`, but **not** `ai` and **not** `@ai-sdk/gateway`. So the `ai` module a Clerk tool imports is the one Eve itself calls, and there is one copy of the Gateway provider in the tree.

The only "embed" strings anywhere in `eve/dist` are inside those vendored provider type files (`index.d.ts` of anthropic, google, openai, provider, provider-utils). Eve's own source and docs contain none.

## 2. Models, dimensions and prices

### 2.1 The typed catalog in the installed provider

`node_modules/@ai-sdk/gateway/dist/index.d.ts` line 100 defines the union `GatewayEmbeddingModelId` with 28 literal ids plus `(string & {})`:

```
alibaba/qwen3-embedding-0.6b, alibaba/qwen3-embedding-4b, alibaba/qwen3-embedding-8b,
amazon/titan-embed-text-v2,
cohere/embed-v4.0, cohere/embed-v5.0-fast, cohere/embed-v5.0-pro,
google/gemini-embedding-001, google/gemini-embedding-2, google/text-embedding-005,
google/text-multilingual-embedding-002,
mistral/codestral-embed, mistral/mistral-embed,
openai/text-embedding-3-large, openai/text-embedding-3-small, openai/text-embedding-ada-002,
perplexity/pplx-embed-v1-0.6b, perplexity/pplx-embed-v1-4b,
voyage/voyage-3-large, voyage/voyage-3.5, voyage/voyage-3.5-lite, voyage/voyage-4,
voyage/voyage-4-large, voyage/voyage-4-lite, voyage/voyage-code-2, voyage/voyage-code-3,
voyage/voyage-finance-2, voyage/voyage-law-2
```

The same file exposes them on the provider as `embedding(id)`, `embeddingModel(id)` and `textEmbeddingModel(id)` (the last marked `@deprecated Use embeddingModel instead`, lines 1179 to 1187). The embedding model class (`dist/index.js` line 1270) declares `maxEmbeddingsPerCall = 2048` and `supportsParallelCalls = true`, and posts to `${baseURL}/embedding-model` with headers `ai-model-id: <id>` and `ai-embedding-model-specification-version: 4`; `baseURL` defaults to `https://ai-gateway.vercel.sh/v4/ai` (line 3070). The body is `{ values, dimensions, providerOptions? }`; the response carries `embeddings`, `usage`, `providerMetadata` and `warnings`.

### 2.2 Prices from the Gateway catalog

The AI Gateway catalog filtered to the Embedding capability lists the same 28 models. Input price per 1M tokens as shown on 2026-10-20 ([catalog](https://vercel.com/ai-gateway/models?capabilities=embedding)):

| Model                                  | $ / 1M input tokens |
| -------------------------------------- | ------------------- |
| alibaba/qwen3-embedding-0.6b           | 0.01                |
| alibaba/qwen3-embedding-4b             | 0.02                |
| alibaba/qwen3-embedding-8b             | 0.01                |
| amazon/titan-embed-text-v2             | 0.02                |
| cohere/embed-v5.0-fast                 | 0.08                |
| cohere/embed-v5.0-pro                  | 0.12                |
| cohere/embed-v4.0                      | 0.12                |
| google/gemini-embedding-001            | 0.15                |
| google/gemini-embedding-2              | 0.20                |
| google/text-embedding-005              | 0.03                |
| google/text-multilingual-embedding-002 | 0.03                |
| mistral/codestral-embed                | 0.15                |
| mistral/mistral-embed                  | 0.10                |
| **openai/text-embedding-3-large**      | **0.13**            |
| **openai/text-embedding-3-small**      | **0.02**            |
| openai/text-embedding-ada-002          | 0.10                |
| perplexity/pplx-embed-v1-0.6b          | 0.00                |
| perplexity/pplx-embed-v1-4b            | 0.03                |
| voyage/voyage-3.5                      | 0.06                |
| voyage/voyage-3.5-lite                 | 0.02                |
| voyage/voyage-4                        | 0.06                |
| voyage/voyage-4-large                  | 0.12                |
| voyage/voyage-4-lite                   | 0.02                |
| voyage/voyage-code-2                   | 0.12                |
| voyage/voyage-code-3                   | 0.18                |
| voyage/voyage-finance-2                | 0.12                |
| voyage/voyage-law-2                    | 0.12                |
| voyage/voyage-3-large                  | 0.18                |

The pricing page states the terms: "AI Gateway charges no markup and no platform fee on tokens. You pay the provider's list price on a pay-as-you-go basis." The free tier "includes a subset of models, not the full catalog" and is "rate limited per model, with lower limits than the paid tier"; purchasing credits moves the team to the paid tier. [[pricing]](https://vercel.com/docs/ai-gateway/pricing)

The two OpenAI model pages: `openai/text-embedding-3-small` is "$0.02 per 1M input tokens", default output 1,536 dims, "The `dimensions` parameter accepts any value below the default", providers azure and openai. `openai/text-embedding-3-large` is "$0.13 per 1M input tokens", 3,072 dims, "Matryoshka dimension reduction lets you shrink the vector size without re-embedding your corpus." Both pages show the context window as "Not applicable". [[3-small]](https://vercel.com/ai-gateway/models/text-embedding-3-small) [[3-large]](https://vercel.com/ai-gateway/models/text-embedding-3-large)

The input ceiling comes from OpenAI's guide: the model table lists "Max input" **8192** for both `text-embedding-3-small` and `text-embedding-3-large`, and "the length of the embedding vector is `1536` for `text-embedding-3-small`" and 3072 for large; "using the `dimensions` parameter when creating the embedding is the suggested approach" to shorten vectors (manual truncation requires re-normalising). [[openai-embeddings]](https://developers.openai.com/api/docs/guides/embeddings)

Every Page in `fixtures/full` fits under that ceiling without chunking: the largest file is `index.md` at 13,174 bytes (about 3,300 tokens at the probe's ratio); the median Page is 856 bytes.

### 2.3 Rate limits

The rate-limits page: "AI Gateway does not rate limit paid-tier requests. The free tier applies lower per-model limits, and a `429` on either tier may come from the upstream provider rather than from AI Gateway." Numbers are not published: "Limits can change, so this page describes behavior rather than fixed numbers." A limited request gets HTTP `429` with body `{"error":{"message":"Rate limit exceeded","type":"rate_limit_exceeded"}}` and sometimes a `retry-after` header; "The AI SDK retries failed requests automatically with exponential backoff, and its `maxRetries` option defaults to `2`." Budgets are separate: exceeding one returns `402` with `quota_for_entity_exceeded`. [[rate-limits]](https://vercel.com/docs/ai-gateway/rate-limits)

The probe's `providerMetadata.gateway.routing.planningReasoning` read "System credentials planned for: openai, azure", so this key is served from Vercel's own provider accounts (not BYOK) with Azure as fallback; the upstream OpenAI limits that apply are Vercel's, not ours, and are opaque to us.

Whether this team is on the free or paid tier was not determinable from the docs: the catalog's `freeTier=true` filter is applied client-side and the fetched page showed no free-tier badges, so it could not be read either way. The probe succeeding is the only hard evidence that `openai/text-embedding-3-small` and `-3-large` are callable from this key.

## 3. What Eve adds: nothing

- `grep -rni 'embed' node_modules/eve/docs` returns no hits. The memory docs mention "semantic search" only for the third-party providers `@supermemory/eve` and `@kybernesis/arcana`, which back Eve memory slots (Clerk uses none, per the map's vocabulary rule). [[memory overview]](../../node_modules/eve/docs/memory/overview.mdx)
- The TypeScript API reference lists every `eve/*` entry point (`eve`, `eve/tools`, `eve/memory`, `eve/models/openai`, `eve/models/anthropic`, `eve/evals`, ...). None exposes an embedding function or re-exports a Gateway client. [[typescript-api]](../../node_modules/eve/docs/reference/typescript-api.md)
- `agent-config.md` line 29: "`model` accepts a gateway model id string, which routes through the Vercel AI Gateway." That is the only Gateway integration Eve performs, and it is for the language model. Eve sets `providerOptions.gateway.sessionId` on its own model calls (line 63); tool code gets nothing of the kind.
- Eve's runtime **reads** `globalThis.AI_SDK_DEFAULT_PROVIDER` in `dist/src/harness/model-call/model.js` and `dist/src/ai/decide.js` (`globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway`), and no file under `eve/dist/src` assigns it. So inside an Eve process the `ai` default provider is still the Gateway, and a string model id in `embed()` resolves exactly as it would in a standalone script.
- `maxTokenCostUsdPerSession` "is a US-dollar limit on model token cost, not tool or infrastructure spend. It uses the cost reported with each model step" (agent-config.md lines 300 to 304). Embedding calls made inside a tool are invisible to Clerk's $1 and 300K-token session caps; they are also so cheap that this does not matter (§5).

## 4. How a Clerk tool calls it

`ai@7.0.143` exports `embed`, `embedMany`, `cosineSimilarity`, the `Embedding`/`EmbeddingModel`/`EmbeddingModelUsage` types, and also `gateway` and `createGateway` (verified by grepping `node_modules/ai/dist/index.d.ts`). When `model` is a string, `ai` calls `getGlobalProvider().embeddingModel(model)` where the global provider is `globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway` (`dist/index.js` lines 1000 and 1143). The Gateway provider takes its key from the `apiKey` option, then `AI_GATEWAY_API_KEY`, then a Vercel OIDC token (`@ai-sdk/gateway/dist/index.js` lines 176 to 187, 3345 to 3352).

The AI SDK docs give the same shape and add `dimensions` (top level, "works with `embed` and `embedMany`, and `embedMany` sends the same value to every batch"), `maxParallelCalls` on `embedMany`, and the `usage` (`{ tokens }`) and `response` fields. [[ai-sdk embeddings]](https://ai-sdk.dev/docs/ai-sdk-core/embeddings) The Gateway embeddings page shows both the string-id form and `gateway.textEmbeddingModel(...)` with the SDK, and the raw OpenAI-compatible `POST https://ai-gateway.vercel.sh/v1/embeddings` for non-SDK callers. [[gateway embeddings]](https://vercel.com/docs/ai-gateway/modalities/embeddings)

So the adapter is a plain function in a package under `packages/`, callable from anywhere in the app runtime:

```ts
import { embed, embedMany } from "ai";

const MODEL = "openai/text-embedding-3-small";
const DIMENSIONS = 512; // optional; omit for the model default (1,536)

export async function embedPage(body: string): Promise<number[]> {
  const { embedding } = await embed({
    model: MODEL,
    value: body,
    dimensions: DIMENSIONS,
  });
  return embedding;
}

export async function embedPages(bodies: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: MODEL,
    values: bodies,
    dimensions: DIMENSIONS,
  });
  return embeddings;
}
```

Call sites, all outside any model call:

- **Write time.** The four tools that write Pages (`agent/tools/create_page.ts`, `update_page.ts`, `change_fact.ts`, `note_also_seen_in.ts`) each end in `store.write(...)`. A tool's `execute(input, ctx)` is an ordinary async function in the app runtime ([tools overview](../../node_modules/eve/docs/tools/overview.mdx) line 31; "Authored tools run in your app runtime with full access to `process.env`", per the earlier wiki-persistence research). Embedding the new body after a successful write is one awaited call added to each.
- **Seed time.** `scripts/wiki-seed.ts` (the `wiki:seed` script) is a plain `bun` script; it can `embedMany` the 74 Pages in one request (well under `maxEmbeddingsPerCall = 2048`) and write the cache alongside the seeded Pages.
- **Query time.** `search_wiki` embeds the query string once per call (one `embed`, about 0.4 s, about 10 tokens) and ranks cached Page vectors with `cosineSimilarity` from `ai`.

Use the string id or `gateway` re-exported from `ai`; do not import `@ai-sdk/gateway` directly, since it is a transitive dependency and `depcruise` boundaries would flag an undeclared import. Typing the id as `GatewayEmbeddingModelId` is available from `ai` only as `GatewayModelId` (language models); the embedding id type lives in `@ai-sdk/gateway`, so a string constant is simplest.

## 5. Cost to embed the Wiki

Inputs: the probe measured **267 tokens for 1,064 bytes** (3.98 bytes per token) of English Markdown-ish text; `fixtures/full` has 72 `.md` Pages excluding `SCHEMA.md` totalling about 86 KB (98,262 bytes across 73 files including `SCHEMA.md`; `index.md` 13,174, `profile.md` 6,791, `log.md` 5,160, median 856). The map says 74 Pages; the difference does not move the numbers.

| Workload                                       | Tokens (approx.) | `text-embedding-3-small` ($0.02/M) | `text-embedding-3-large` ($0.13/M) |
| ---------------------------------------------- | ---------------- | ---------------------------------- | ---------------------------------- |
| Every Page once (86 KB)                        | 21,600           | **$0.00043**                       | $0.0028                            |
| Every Page plus `SCHEMA.md` (98 KB)            | 24,700           | $0.00049                           | $0.0032                            |
| One median Page per write (856 B)              | 215              | $0.0000043                         | $0.000028                          |
| The largest Page per write (`index.md`, 13 KB) | 3,300            | $0.000066                          | $0.00043                           |
| One query (`search_wiki`)                      | 10 to 30         | < $0.000001                        | < $0.000004                        |
| 1,000 median-Page writes a month               | 215,000          | $0.0043                            | $0.028                             |

The Gateway's own figure for the probe call, `cost: "0.00000534"` for 267 tokens, is exactly $0.02 per million, confirming no markup on this key. Re-embedding the whole Wiki on every write (the thing the map forbids) would still cost under a tenth of a cent per write; the reason to cache is latency and Blob operations, not dollars.

Storage of the cache: 74 vectors of 1,536 float32 values is 455 KB raw (about 1.1 MB as JSON numbers); at 512 dims it is 152 KB raw (about 370 KB JSON). Either fits one Blob or one local file.

## 6. What could make the embedding rung infeasible

Nothing hard. Soft constraints the map should record:

1. **Blob advanced operations.** "Advanced Operations: Counts when you upload, copy, or list blobs"; Hobby includes "First 2,000" a month and, once exceeded, "you will not be able to access Vercel Blob if limits are exceeded ... wait until 30 days". Rate: 900 advanced operations a minute on Hobby. [[blob pricing]](https://vercel.com/docs/vercel-blob/usage-and-pricing) The `WikiStore` Blob backend already spends one `put` per Page write and one `list` per prefix listing. A per-Page vector sidecar adds one `put` per write; a single `retrieval/embeddings.json` per namespace adds one `put` per write and one `get` (a simple operation) per query. Seeding 74 Pages as individual sidecars costs 74 advanced operations once; as one file, 1. Neither threatens the 2,000 cap at demo volumes, but the single-file design is cheaper and matches ADR-0001's "Neon Postgres is the fallback behind the same interface if the Blob cap bites".
2. **Latency.** Each write tool call gains one Gateway round trip (380 to 435 ms warm, about 1 s cold in the probe, dominated by HTTP setup rather than text length) and each `search_wiki` call gains one for the query. Within the session's at-most-8-tool-call eval budget that is well under 1 s of added wall time per query. `embedMany` for the seed is one request.
3. **No offline mode.** `eve eval` runs against the local store but the adapter still calls the Gateway. Without `AI_GATEWAY_API_KEY` or network, `embed` throws (`Provide an API key or Vercel access token via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable`). The adapter must catch, log, and fall to lexical-only, and the eval report should label which rung answered.
4. **Cache invalidation on model change.** Vectors from different models or dimension counts are not comparable. Store `{ model, dimensions, etag }` with each vector and treat any mismatch as a miss. The Gateway catalog does change (the typed union is a snapshot of 4.0.116; `(string & {})` exists because ids come and go).
5. **Tier uncertainty.** If the team is on the Gateway free tier, per-model limits apply and are unpublished; a `429` is retried twice by the SDK and then throws. Seeding 74 Pages is one request, so only a burst of writes could trip it. Record the degrade path as "429 after retries: lexical-only for this call, vector left stale and retried on next write".
6. **Session cost cap does not see it.** Embedding spend is outside `maxTokenCostUsdPerSession`, so it cannot be bounded by Eve; at the prices above a runaway loop embedding every Page on every call would cost about $0.0005 per iteration, which is a bug to catch in tests rather than a financial risk.
7. **Sources must stay out**, per the map's out-of-scope line. The adapter should take a Page body, not a path, and the only caller that has Source text is `read_source` with Masking, which must not call it.

## 7. Live probe

Run on 2026-10-20 from a throwaway script in `/tmp` with `bun --env-file=.env.local`, importing `embed` from the installed `ai` and `createGateway` from the installed `@ai-sdk/gateway`. The value was a synthetic 1,064-byte sentence repeated 14 times, not a repo Source or Page. The key was never printed.

| Call                            | Model id                                                    | Dimensions | Latency  | `usage`           | Gateway cost |
| ------------------------------- | ----------------------------------------------------------- | ---------- | -------- | ----------------- | ------------ |
| 1, cold                         | `openai/text-embedding-3-small`                             | 1,536      | 1,023 ms | `{ tokens: 267 }` | $0.00000534  |
| 2                               | `openai/text-embedding-3-large`                             | 3,072      | 414 ms   | `{ tokens: 267 }` | $0.00003471  |
| 3, warm                         | `openai/text-embedding-3-small`                             | 1,536      | 435 ms   | `{ tokens: 267 }` |              |
| 4, string id, `dimensions: 512` | `"openai/text-embedding-3-small"` via `ai` default provider | **512**    | 380 ms   | `{ tokens: 267 }` |              |

`providerMetadata.gateway` on call 1: `resolvedProvider: "openai"`, `fallbacksAvailable: ["azure"]`, `credentialType: "system"`, `statusCode: 200`, `surchargeCost: "0"`, `marketCost == gatewayCost`. Provider-side time (`endTime - startTime` inside the routing block) was 165 ms for call 1 and 195 ms for call 2; the rest of the wall time is the Gateway hop and TLS. `warnings: []` on every call. No errors.

## Recommendation

- **Use `openai/text-embedding-3-small` through the string id**, `embed`/`embedMany` from `ai`, no Eve helper, no new dependency. It is the cheapest OpenAI option at $0.02 per 1M tokens, the one every Gateway doc example uses, and the probe confirms it works from this key with the pinned `ai@7.0.143` and inside the `eve@0.80.1` runtime (Eve never replaces the default provider).
- **Pass `dimensions: 512`** unless the eval diff shows a loss: it cuts the cache three times over, cosine scores stay meaningful ("Semantic structure is front-loaded into the earlier dimensions" per the model page), and the OpenAI guide calls the parameter "the suggested approach".
- **Embed at write time in the four writing tools and at seed time in `wiki:seed`; embed the query once in `search_wiki`.** Store vectors in one `retrieval/embeddings.json` per namespace behind `WikiStore` (one blob, one `put` per write, one `get` per query), keyed by Page path with `{ model, dimensions, etag, vector }`. Never embed Sources; the adapter takes a body string.
- **Degrade path:** any thrown `embed` error (missing key, network, `429` after the SDK's two retries, `402` budget) logs once, marks the vector stale, and `search_wiki` runs lexical-only for that call; the eval report labels the rung. Evals without a key must still pass.
- **Budget to keep in the map:** about $0.0005 to seed the Wiki, under $0.01 a month at demo write volumes, and one Blob advanced operation per write, all comfortably inside ADR-0001's limits. Nothing here justifies cutting embeddings for cost; cut them only if the one-to-two-day build budget runs out, which is what the map already says.

## Open questions

1. **Free or paid Gateway tier?** The docs do not say which tier this key is on, and the catalog's free-tier badges could not be read. If free, the per-model limits are unpublished; a dashboard check (AI Gateway tab, credits balance) settles it in a minute.
2. **Where does the vector cache live under evals?** Evals seed a fresh namespace per run from `WIKI_SEED`. Either the seed fixture ships a prebuilt `retrieval/embeddings.json` (deterministic, no network at eval time, but must be rebuilt when fixture Pages change) or the eval `setup()` embeds 74 Pages once per run (one `embedMany`, about $0.0005, needs network). The first keeps evals offline-capable and belongs with the cache-design ticket.
3. **Chunking.** Every current Page is under 8,192 tokens, so one vector per Page suffices. If Ledgers or the Index grow past about 30 KB this changes; the map should state the limit rather than chunk now.
4. **Does the query embedding need the same `dimensions`?** Yes by construction (vectors must match), but if the map later picks a different query-side prefix or instruction format (some models distinguish document and query inputs; OpenAI's do not), it must be recorded with the model id in the cache header.
5. **Gateway catalog drift.** The 28-id union is a snapshot in `@ai-sdk/gateway@4.0.116`. The adapter should not type-check against it; a string constant plus the cache header's model id is enough to detect a swap.
