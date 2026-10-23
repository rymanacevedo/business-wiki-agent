---
status: accepted
---

# The retrieval cache lives under a hidden prefix, validated by an etag manifest

Retrieval needs two derived structures over the Wiki: a lexical section index with the Link table, and a set of section embeddings. The first is cheap to rebuild from Page text; the second costs a network call per section. Both go stale whenever a Page changes, and the store offers no change feed: `wiki(ctx)` builds a fresh `WikiStore` on every tool call, and Vercel's Fluid compute pauses and cold-starts instances, so in-process state is a speed-up, never the source of truth ([research](../research/retrieval-cache.md) on branch `research/retrieval-cache`).

We keep the lexical index and Link table as an in-process memo per namespace and validate it on every search with one `manifest(prefix)` call, a new method on `Backend` and `WikiStore` returning `{ path, etag }[]` (the Blob SDK already returns etags on `list`; the local backend hashes bodies). Only Pages whose etag changed are re-read. We persist the embeddings as one file, `cache/embeddings.json`, inside the namespace, written through the same `WikiStore` with etag-guarded writes. `namespacedStore` hides the `cache/` prefix from `list` and `manifest`, so every caller that treats "all keys under the namespace" as "all Pages" (the Index gate, the duplicate check, the INGEST check, the eval seeding check) never sees it; `read` and `write` of it work normally. Fixtures ship a prebuilt cache file, copied by seeding like any other file.

Alternatives rejected: a sibling namespace for the cache (under evals the namespace is `eval/<run>/<session>`, so a sibling needs its own seeding and cleanup, and the "namespaces are leaves" rule would gain an exception); invalidating the memo from the four write tools (redundant once etags are compared, and it couples every write path to retrieval); a dotted prefix such as `.retrieval/` (the store's path rules reject it by design); Neon Postgres (a new runtime service for a cache that fits in one blob).

## Consequences

- `WikiStore` grows by one method; `list` keeps its contract for its existing callers, and a unit test asserts that `list("")` never returns a `cache/` path.
- Every `search_wiki` call spends one Blob advanced operation on the manifest, about 50 a month at demo traffic, inside ADR-0001's cap of 2,000.
- A cache file is only ever as current as its etags: a Page edited after the cache was built is re-embedded lazily on the next search, never served stale.
- No model tool can write under `cache/`, because `validatePage` accepts only the eight Page folders; if a new Page folder is ever added, that guard must still exclude `cache/`.
- Evals start warm from the fixture's cache file and need no network to embed at seed time.
