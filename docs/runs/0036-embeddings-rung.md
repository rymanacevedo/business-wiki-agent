# 0036: Embeddings for retrieval (ticket #58)

- **When**: 2026-10-23
- **Agent**: Claude Code (Claude Opus 5.5), implementer for #58 under the spec #53 orchestrator
- **Driving**: [Embeddings: Gateway adapter, section cache, fixture embed step, fusion, degrade path](https://github.com/rymanacevedo/business-wiki-agent/issues/58), PR #71, stacked on #56

## Goal

Build the embedding Rung behind `search_wiki`: a Gateway adapter, a section vector cache in the namespace, a fixture embed step, RRF fusion, and the degrade path.

## What happened

- `packages/wiki-retrieval/gateway.ts` (second entry point): `embedMany` from `ai` with `openai/text-embedding-3-small` at 512 dimensions. The model id lives in the package so the cache header stays consistent with it.
- `cache/embeddings.json` holds `{ model, dimensions, pages: { path: { hash, sections: { id: base64 float32 } } } }`. **The cache is keyed by content hash, not store etag.** `hash` is the sha256 of the Page body, computed by the package. This answers the etag warning in runlog-55: the local etag is that same hash, and a Blob etag is MD5-style, so keying by store etag would leave a locally built fixture cache stale on Blob.
- Inside `search`:
  - The query and the delta (at most 20 sections) are embedded in two parallel `embed` calls.
  - The delta is persisted with an etag-guarded write. The loser of a race drops its write and reloads on the next search.
  - Lexical and semantic results are fused by RRF (k = 60, top 20 of each).
  - If `embed` throws, the search falls back to lexical, sets `degraded`, and warns once per process.
- `CLERK_RETRIEVAL_EMBEDDINGS=0` in `agent/lib/config.ts` (`retrievalEmbed()`) turns embeddings off.
- `wiki:build-fixture --embed-only` writes only the cache into an existing fixture. A full build also runs the step and reuses the old cache.
  - Ran live: 109 and 21 sections. After merging #56's YAML repair, both caches were rebuilt from scratch, because section text changed while Page bodies did not.
- Tests use a deterministic fake that folds a few words into concepts, so both semantic rows become Matches; lexical-only misses them.

- Review gate (`review:spec --base origin/ticket/56-wiki-retrieval-lexical --ticket 58 --ticket 53`):
  - Run 1 exited 2: posting the ticket comment changed the spec mid-review.
  - Run 2 exited 1 with two blockers:
    - a refresh during the embed call could store old vectors under an edited Page's hash
    - a failed cache read degraded the search
  - Both were repaired test-first: embedding now uses a snapshot of the Pages, and only `EmbedUnavailable` degrades. A cache read error fails the search.
  - Run 3 exited 0 with no findings and no advisories, on 646cdb7. `--status` exited 0.
  - Run 4, on 2aaf227 after the docs-only run entry, exited 1 with one blocker. The search took its hits before awaiting the embedding Rung but read Page metadata from the memo's live Map, so a refresh mid-embed showed one revision's title and status beside the other's excerpt.
    - The fix covers the whole class, not just this case: `memo.refresh()` now returns an immutable Snapshot, copied only when something changed. A search keeps that Snapshot and its lexical index as locals from start to finish.
    - Four public-interface tests, each failing on the old code first: a `flagged()` refresh mid-embed, a concurrent search, a Page deleted mid-embed, and a refresh that fails part-way mid-embed. In each, the result must read wholly as one revision.

## Findings worth remembering

- **In hybrid mode no query gets zero Matches.** Under RRF, the default third-of-top floor never drops anything in either top 20, and the spec has no cosine floor. This is for the bench (#60) and the absent rows.
- **The cache does not notice code changes.** It is keyed by Page content, so a change to the sectioning code leaves stale vectors. In that case delete the cache and rerun `--embed-only`.
- **Live Gateway results:**
  - Each search costs 300 to 535 ms for the query embedding.
  - The semantic rows place Ridgeline 4th and Eastside 2nd among Matches.
  - Eval rows `query/questions/0019` and `0020` passed 2 of 2 with Rung `embedding`.
- **Shell gotchas in this environment:**
  - `rm` is aliased to `gio trash`, so use `command rm`.
  - Posting a `gh issue comment` on the ticket while a review runs makes the review stale (exit 2).

## What the human checked

Nothing yet: the PR is a draft for the human.

## Open questions

- Whether hybrid results need an absolute similarity floor. The bench (#60) and the after runs decide.

## Artifacts

- PR #71, branch `ticket/58-embeddings`
- `packages/wiki-retrieval/{gateway.ts,lib/embeddings.ts,lib/fusion.ts,lib/semantic.ts}`
- `scripts/lib/fixture-embed.ts`
- `fixtures/{base,full}/cache/embeddings.json`
