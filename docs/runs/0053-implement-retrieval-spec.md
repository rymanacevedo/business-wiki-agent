# 0053: Implement spec #53 (Retrieval for Clerk) across tickets #54–#63

- **When**: 2026-10-21 to 2026-10-23
- **Agent**: Claude Code (Opus 5.5) orchestrating implementer subagents in worktrees
- **Driving**: `/implement-spec` on [Spec: Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

Originally 0042 on `wayfinder/49-eval-story`. Spec #53's spend, $3.77, is the difference between the two credit figures below.

## Goal

Implement every ticket of spec #53 with the new per-ticket PR flow (`docs/agents/integration-review.md`): one stacked draft PR per ticket, a Codex review gate per PR, the human merges.

## What happened

- The first run of the per-ticket flow. Each ticket had its own worktree and branch `ticket/<n>-<slug>`. A stacked PR was based on its blocker's branch. Each implementer posted `bun run check` evidence on the ticket before its review, because the reviewer's read-only sandbox can't run tests.
- **The stack collapsed downward.** The human merged stacked PRs into their parent branches, not bottom-up into `main`, so two PRs carried several tickets:
  - #66 and #68 landed on #65, which then carried #54, #55 and #62 and needed a fresh review over all three. It passed and merged to `main` with a merge commit, so its eval baseline tag landed on `main`.
  - #69, #71, #72, #70 and #73 landed on #67 (#56), which then closed #56–#61.
- **#67's review never passed.** The human approved rounds 3, 4 and 5, and each round's narrow fix produced the next variant: the YAML frontmatter parser, then alias cycles, then a 16,000-character parse cap, then fences inside blockquotes. The human chose to mark #67 ready on their decision. The two code blockers moved to #63, and #63's own spec work was the third.
- **#63 (PR #74)** fixed both moved blockers test-first, then ran the labelled after-runs. Query went from 24/25 before to 21/25 hybrid, 23/25 lexical-only and 21/25 with the hop on; all cases went from 69/73 to 65/73. The spec's decision rules, applied as written, turned embeddings off by default (`CLERK_RETRIEVAL_EMBEDDINGS=1` turns them on) and kept the Neighbourhood off. The README says retrieval did not help on this corpus.
- #74's review failed three rounds on narrower marked list and tab variants in the Link chunker. The human chose to mark it ready with the last one filed as #75.
- Gateway credit went from $16.43 at the start to $12.66; #74's live runs cost $2.27.

## Findings worth remembering

- `review:spec --spec` takes a file path, not an issue; pass the spec issue as a second `--ticket`. Reviewing an early ticket against the whole spec flags later tickets' work, so use a spec-section file for those.
- Commenting on a ticket during its review makes the review stale. Any commit after a review, docs included, needs a fresh one.
- Merging a stacked PR into its parent makes the parent carry both tickets. `Closes` lines added to the parent's body afterwards were not honoured for #65 (#55 and #62 were closed by hand) but were for #67, so check every ticket after a merge.
- The pattern from spec #15 repeated: a hand-written re-derivation of a parser's rules (marked's container and tab rules) yields one new variant per review. A structural fix, such as cutting only where marked's own lexer reports a boundary, is the open option on #75.
- The auto-mode permission check blocks the agent from merging PRs, so the human merges, even into stack branches.
- Clerk called `search_wiki` in only 4–6 of 25 Query rows per run, so most retrieval verdict flips were answer wording.

## What the human checked

- Approved repair rounds 3, 4 and 5 on #67, then chose to ship it with known blockers moved to #63, and chose the same for #74 with #75.
- Chose to collapse #70 and #73 into #67 for one combined review.
- Merged every PR.

## Open questions

- #75 (Link chunker tab variant) and whether to replace the hand-written chunker structurally.
- Whether retrieval earns its place: on this corpus the baseline already passed 7 of 8 retrieval rows.
- This session's doc fixes to `docs/agents/integration-review.md` are on `wayfinder/49-eval-story`, not yet pushed.

## Artifacts

- PRs #65, #67, #74; follow-up #75
- Implementer run logs outside the repo: `retrieval-notes/runlog-54.md` … `runlog-63.md`
- `docs/evals/before-after.retrieval.md`, `docs/evals/runs/retrieval-*`
