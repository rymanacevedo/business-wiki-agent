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

- Codex review round 1 (exit 1) raised these, each repaired test-first:
  - a refresh that throws part-way could leave the index stale for good; the memo version now moves with every change
  - digit-led identifiers (`1099NEC`, `12A`) were split; they now stay whole
  - block-style frontmatter lists were not indexed
  - `flagged` missed flags carrying YAML comments
  - the deferred spot check
- Codex round 2 (exit 1) raised these, repaired test-first:
  - a failed refresh released its queue while its reads still ran, so the next refresh could exceed 10 in flight and old text could overwrite new; the pool now drains first
  - a comment on a list key hid the block list's items
- Codex round 3 on 00662f8: exit 1. Standards had 0 findings. One Spec blocker is left (`flagged` misses multi-line YAML flow `flags` lists), plus the 108/109 advisory. Per the flow, it went on the PR as a comment after two repair rounds, and the PR stays a draft.
- The human approved a third repair round. Round 3's blocker was a symptom: the frontmatter was read line by line, so each new YAML spelling needed its own case. The memo and section 0 now read it once, as YAML, with page-edits' `parseFrontmatter` (now exported from `page-edits`). Test-first, with 21 `flags` spellings (flow and block lists, multi-line flow lists, comments, quotes, empty lists, `~`, a lone scalar, odd indentation, an alias, a nested item, a commented-out line, a nested non-Page key) and four malformed frontmatters. A malformed frontmatter now reads as empty (no facts, no flags, title falls back to the path), and its body stays searchable. Scalars keep their written text, so `20.00` stays `20.00`. `fixtures/full` still makes 109 sections, and the snapshots are unchanged. Merged the moved `ticket/54` base first (#68).
- The 108/109 explanation was posted on #56.
- Round 4 on 69113af: exit 1. Standards had 0 findings. New Spec blocker: `fold` followed YAML aliases with no cycle check, so `extra: &loop\n  self: *loop` (which validatePage accepts) made `search` and `flagged` throw RangeError on every refresh, for the whole namespace. The human approved a fourth repair round.
- Round 5 fixed the class, not the instance: one Page must never take retrieval down. Test-first, in `tests/hostile.test.ts`, at the public interface. Each test failed without its fix.
  - Frontmatter folding never re-enters a map it is already folding, and stops after 1,000 map entries. Alias fan-outs (10 aliases a level, 30 levels) had been exponential.
  - `parsePage` never throws. An unreadable frontmatter leaves the body searchable. A Page that cannot be parsed at all is kept with no sections, read once per etag, and warned about once. Store I/O failures still fail the refresh: they are not one Page's fault, and skipping them would make `flagged` silently incomplete.
  - Links: `marked` reads at most 16,000 body characters (it is quadratic on unclosed emphasis: 130 s for a 240 KB body). A body it cannot lex (a stack overflow on deep blockquotes) carries no body Links, and its frontmatter Links stay.
  - Embeddings: each input is cut to 8,000 UTF-8 bytes, under the model's 8,191-token limit, so one long one-line section (or Query) can no longer fail its batch and degrade every search. The largest fixture section is 1,692 bytes, so the committed caches are unchanged.
  - 20 tests: self, mutual and flow cycles, aliases in `flags`, 2,000-deep nesting, three fan-outs, deep blockquotes, quadratic emphasis, nested lists, a 200 KB section, an over-long Query, and a corrupt store entry. `bun run check`: exit 0, 592 tests. Still 109 sections; the snapshots are unchanged.
- The combined review on 78cf852 (56+57+58+61+53, base origin/main) exited 1. Round 4's alias blocker was gone. Round 5 had added a new P2: `links.ts` read only the first 16,000 body characters, so a long ordinary Page lost its late Links and its reference definitions. The P1, Lint on `search_wiki`, belonged to #59.
- Round 6 (the fifth and last approved repair round) replaced the cutoff with `lib/markdown.ts`, which reads the whole body in bounded pieces. Tests came first: a late inline link, a late reference definition, and a list item with a 500 KB paragraph all failed on the old code. Profiling turned up four superlinear spots in `marked`:
  - its inline pass, on emphasis runs and escapes
  - its block pass, on a long paragraph, worst inside a list item: 18 KB took 3.2 s and 36 KB took 30 s, so even the old 16 KB cap was slow
  - recursion on one line of nested markers
  - `walkTokens`, which is quadratic in the token count through `concat`
- The bounds:
  - chunks of about 4,000 characters, cut before a top-level block that follows a blank line, or inside one long block before a line with no link or code span open. A line indented 4+ spaces gets a leading text line so it is not read as code. No cut falls inside a fence, an HTML comment or a `<pre>` block.
  - reference definitions shared across chunks
  - 1,000-character inline pieces cut at whitespace outside brackets, parentheses and code spans
  - at most 32 container markers on a line
  - an iterative token walk
- The fix was attacked with 56 shapes (late links in long lists, after and inside huge code blocks, unclosed fences, HTML comments, tables, 240 KB emphasis, escapes, backticks, links and brackets, 60,000-line paragraphs, list items, one-line nested markers). All were correct and the slowest took 750 ms, except one: 5,000 nested `[` around one link loses that link. Link and Citation sets match a whole-body `marked` parse on 170 fixture, corpus and docs Pages, on 40 concatenations of them, and on 300 random 50 to 70 KB bodies.
- PRs #70 (#59) and #73 (#60) were then merged into ticket/56 through GitHub, so PR #67 now ships 56+57+58+59+60+61. Run entry 0036-query-rung-metrics was renumbered to 0040. `bun run check`: exit 0, 629 tests.
- Spot check once #54's runs had finished. `WIKI_SEED=full eve eval query/questions/0017 lint/checks/0004 safety/runtime/rows/0000`: 3 of 3 pass (23 gates; the cash row was judged faithful and cited). The run directory was not kept.

## Findings worth remembering

- `fixtures/full` is 109 sections, not 108. The research counted without the 300-token split, which fires once (the 2026-09-30 bank statement's Transactions section).
- Day-one risk: under `eve dev`, `action.result.output` carries the full `execute` object. `turn.toolCalls` comes from `action.result`, so the Query metrics can read it directly.
- Live, the cash Query returned exactly the two cash Records. Excerpt padding with leading lines showed `vendor`/`date` instead of the receipt's Total, and Clerk quoted the cash tendered (20.00) rather than the 15.61 total. This is evidence for the bench and eval tickets.

## What the human checked

Nothing yet: PR #67 is a draft pending the final combined review.

## Open questions

- Amend the AC's section count from 108 to 109, since the split is the spec's own rule.

- `CLERK_RETRIEVAL_NEIGHBOURHOOD` and `CLERK_RETRIEVAL_EMBEDDINGS` are not wired yet (#57, #58).

## Artifacts

- Branch `ticket/56-wiki-retrieval-lexical`, PR #67
- Notes: `retrieval-notes/runlog-56.md` (outside the repo)
