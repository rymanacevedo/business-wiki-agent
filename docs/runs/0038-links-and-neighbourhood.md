# 0038: Links and the Neighbourhood behind the experimental switch

- **When**: 2026-10-23
- **Agent**: Claude Code (Opus 5.5), implementer stacked on #56
- **Driving**: [Links and the Neighbourhood behind the experimental switch](https://github.com/rymanacevedo/business-wiki-agent/issues/57), spec #53, decisions #46

## Goal

Build the Link table and the one-hop Neighbourhood in `wiki-retrieval`, off by default and switched on only by `CLERK_RETRIEVAL_NEIGHBOURHOOD=1`.

## What happened

1. Added `lib/links.ts`, the Link table. It reads the four kinds:
   - `cites`: Citations, including multi-id `(src: a, b)`, and `sources`.
   - `links`: Markdown links, resolved relative to the Page.
   - `party`: `expense.vendor`, `vendor` and `counterparty`.
   - `supersedes`: `superseded_by`.

   Links collapse per Page pair. The table is kept per Page etag with a reverse index, so each refresh re-reads only changed Pages and drops removed ones. Dangling and self targets are dropped. Scaffolding and Sources never enter, because the memo excludes them.

2. Added `lib/neighbourhood.ts` for the ordering. Neighbours rank by:
   1. reach (distinct Matches), highest first;
   2. the best reaching Match's rank;
   3. the kind prior;
   4. path.

   `via` lists the reaching Matches in Match order, and neighbours fill the room left under 8 Pages. Degree-weighted reach with a floor is the factory option `reach: { rule: "weighted", floor }` for the bench. The default is `{ rule: "count" }`.

3. Chose the labels from the neighbour's side, as the prototype did, which is what the ticket's demo implies (the statement is "cited by" the Ridgeline Record). The backward `party` word is **`names party`**.
4. Added `retrievalNeighbourhood()` to `agent/lib/config.ts`. It is true only for `"1"`. `search_wiki` passes it as the `neighbourhood` search option.
5. Tests at the package interface on `fixtures/full` cover:
   - the three Link pairs, both ways;
   - both Neighbourhood rows;
   - the ordering, the cap, and `kind` filtering Matches only;
   - the switch, and the weighted rule;
   - the delta.

   Render snapshots cover on with neighbours, on and empty, and off. Mutation checks confirmed that the count rule, the tie-breaks, the etag delta and the multi-id split are each guarded by a test.

6. Merged #56's round-4 repair, then moved the Link table onto page-edits' `parseFrontmatter` to match the memo.
7. Review round 1: Standards had 0 findings, Spec had 1 blocker. The raw `](...)` scan took links inside code spans and after escapes, and missed reference links. The fix lexes the body with `marked` (17.0.6, already in the lockfile, now a direct dependency) and counts Citations only in prose outside code. I wrote the test first and tried to break the fix with tables, link text, lists and escapes. The fixture's Link table is identical before and after.
8. Review rounds 2 and 3: exit 2 both times, with 0 findings on both axes. The Codex reviewer runs `--sandbox read-only`, and `bun test` needs temp dirs (EROFS), so it could not confirm "`bun run check` is green".
9. Merged ticket/56 at 523d97a, which now carries #58 (embeddings) and #61 (metrics). `search` conflicted:
   - The hop now runs after fusion, on the fused Matches, and the one return carries `rung`, `degraded`, `hopRan` and `pages`.
   - #58 made `memo.refresh()` return an immutable Snapshot. The old Link table was one mutable table brought level inside `search`. It was consistent only because the update and the hop ran with no await between them.
   - The Link table is now built per Snapshot: `createLinker().table(pages)` returns a table that is never changed once built, and each Page's Links are still read once per etag. `search` takes it as a local before the embed await, cached beside the index for that Snapshot.
   - Tests first: two hop-on tests pause the fake adapter and refresh mid-embed (via `flagged()`, and via a second hop-on search). They check that the Match, its Link and the neighbour's title all come from one revision. Reading the table from instance state after the await fails the second test. A third test runs hop-on with the fake adapter on both Neighbourhood rows: Rung `embedding`, neighbours after Matches, the August statement present.
   - `bun run check`: exit 0, 572 tests.

## Findings worth remembering

- Both Neighbourhood rows already have the August statement as a lexical Match. The hop adds neighbours to both rows but is not what finds the expected Page. Expect `expected_via_hop_only = 0` on those rows unless Clerk searches with other words.
- On "Which purchases did the August bank statement confirm?", the September statement ranks first. Its Records take the 3 neighbour slots, so the August Records (Harbor Hardware and others) do not appear there.
- Live `eve dev` (local namespace, hop on): Clerk answered both Neighbourhood prompts from `read_index` + `read_page` and never called `search_wiki`. The instruction sentence (#61) decides whether the hop is ever exercised. A turn that asked for the search explicitly got 4 labelled neighbours.

## What the human checked

Nothing yet: PR #72 is a draft for review.

## Open questions

- `review:spec` cannot complete Spec for packages whose tests need a writable temp dir; the gate's sandbox may need a writable TMPDIR.

## Artifacts

PR #72 (`ticket/57-links-neighbourhood`), commits 1b82e04, 09bde44, 21cb0bd, merge 704b05b.
