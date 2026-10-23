# 0032: Store manifest with etags and the hidden cache prefix

- **When**: 2026-10-23
- **Agent**: Claude Code (Claude Opus 5.5), implementer for one ticket under the per-ticket PR flow
- **Driving**: [Store manifest with etags and the hidden cache prefix](https://github.com/rymanacevedo/business-wiki-agent/issues/55), spec [Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53); PR #66, stacked on #54's branch

## Goal

Give `WikiStore`, `Backend` and the eval session wrapper a `manifest(prefix)`, hide `cache/` from `list` and `manifest`, and measure Blob latency for a cold retrieval rebuild.

## What happened

- Built test-first at the store seam (both backends: temp dir and the fake Blob), then the seed, the fixture reader, the wiki browser, and the model-facing Page path check.
- Hid `cache/` in `namespacedStore`, not in `Backend.list`, so a forced reseed still lists and removes the cache file before copying the fixture's.
- `readWikiDir`, `openWikiPage`, `pagePath` (every write tool) and `read_page` now treat `cache/` as not a Page. The spec said "the Page validator knows only the Page folders", but `validatePage` and `pagePath` accepted any `.md` path, and `read_page` read any path, so this was closed explicitly. `read_page` answers "No Page at ..." for a cache path, which is what it says today when no cache exists.
- Measured Blob read-only (`list` and `get` only, token from `.env.local`) against the deployment's store: the only namespace is `demo`, whose 73 Page keys are exactly `fixtures/full`'s.

## Findings worth remembering

- **Blob `get` returns a weak etag `W/"..."` for bodies of 1 KB or more** (29 of 73 Pages; sizes 1,034 to 13,174 bytes weak, 330 to 998 strong), while `list`, `head` and `put` return the strong form. Unnormalised, those Pages would look changed on every search. The Blob backend now strips `W/` on read; the fake Blob reproduces it.
- Whether Blob's `ifMatch` accepted the weak form before is unverified (no live write was made). If it compares strongly, large-Page writes in production were conflicting before this change.
- Latency through the store code, local machine to the store: `manifest("")` 308 to 822 ms; 73 reads with 10 in flight 1,008 to 2,147 ms; cold rebuild 1.3 to 3.0 s; serial 9.7 to 9.9 s. Raw `get` p50 158 ms, p90 227 ms. Inside the 1 to 4 s estimate: the 10-in-flight bound stays.

## What the human checked

Nothing yet; the PR is a draft pending the Codex review gate.

## Open questions

- Whether production writes on large Pages were conflicting before the etag fix.
- Latency from a Vercel function (same region as the store) is likely lower than from this machine.

## Artifacts

- PR #66, branch `ticket/55-store-manifest`
- `packages/wiki-store/lib/{backend,blob,local,store,paths,seed}.ts`, `packages/wiki-check/lib/read.ts`, `packages/wiki-links/lib/open.ts`, `agent/lib/pages.ts`, `agent/tools/read_page.ts`, `agent/lib/eval-wiki.ts`
