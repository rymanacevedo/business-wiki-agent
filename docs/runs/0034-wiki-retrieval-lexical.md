# 0034: wiki-retrieval package, lexical Matches behind search_wiki

- **When**: 2026-10-23
- **Agent**: Claude Code (Claude Opus 5.5), implementer under the spec #53 orchestrator
- **Driving**: [wiki-retrieval package: lexical Matches behind search_wiki in Variant A](https://github.com/rymanacevedo/business-wiki-agent/issues/56), PR #67, stacked on #66 (#55) and #65 (#54)

## Goal

Ship the tracer bullet: the `wiki-retrieval` package with lexical Matches only, `search_wiki` rewired to it, Variant A through `toModelOutput`.

## What happened

- Built test-first at the package entry points over a local store seeded from `fixtures/full`:
  - the tokeniser (research #45's table as expected values)
  - the sectioniser, including the 300-token split
  - BM25 with Lucene IDF
  - the etag-validated memo: one `manifest("")`, a delta re-read with 10 in flight
  - Match collapse with the pre-registered Match floor of a third, the `kind` filter and caps
  - the excerpt rule
  - `flagged`
  - `renderResult` (Variant A)
- One bug found by its own test: the index rebuilt on a "changed" flag that `flagged` could consume first. Replaced it with a memo version counter.
- `agent/lib/config.ts` gained `retrieval(ctx)`: one instance per namespace, keyed with the store directory, LRU-bounded at 8. `search_wiki` takes `kind` (the five matchable Page kinds), returns `{ rung, hopRan, matches, neighbours, text }`, and projects the text.
- `page-edits` now exports `splitPage`, so the package does not duplicate it.

## Findings worth remembering

- `fixtures/full` is 109 sections, not 108. The research counted without the 300-token split, which fires once (the 2026-09-30 bank statement's Transactions section).
- Day-one risk: under `eve dev`, `action.result.output` carries the full `execute` object. `turn.toolCalls` comes from `action.result`, so the Query metrics can read it directly.
- Live, the cash Query returned exactly the two cash Records. Excerpt padding with leading lines showed `vendor`/`date` instead of the receipt's Total, and Clerk quoted the cash tendered (20.00) rather than the 15.61 total. This is evidence for the bench and eval tickets.

## What the human checked

Nothing yet; the PR is a draft awaiting review.

## Open questions

- The AC's three-row slice spot check was deferred because the Gateway is shared with #54's eval run.
- `CLERK_RETRIEVAL_NEIGHBOURHOOD` and `CLERK_RETRIEVAL_EMBEDDINGS` are not wired yet (#57, #58).

## Artifacts

- Branch `ticket/56-wiki-retrieval-lexical`, PR #67
- Notes: `retrieval-notes/runlog-56.md` (outside the repo)
