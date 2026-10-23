# 0041: Retrieval after runs, the decision rules, and the README

- **When**: 2026-10-23
- **Agent**: Claude Code (Claude Opus 5.5), implementer under the spec #53 orchestrator
- **Driving**: [After runs, decision rules, README diagram and docs](https://github.com/rymanacevedo/business-wiki-agent/issues/63), the last ticket of [Spec: Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

## Goal

Fix the two blockers PR #67 left to this ticket. Then run the labelled after runs and apply the pre-registered rules as written. Then put the result on the README diagram, in a second diff block, and in the evals page.

## What happened

- **Rung metrics resolve Source ids exactly.** The blocker came from PR #67's review. Substring matching let `…-dockside-deli-reminder.md` count as the Dockside summary. `citesPath` now carries the bench's exact rule (`summaries/<id>.md`), and the bench imports it from `answer-checks`. Fixed test-first.
- **No chunk cut inside a code block at any container depth.** This was the other PR #67 blocker.
  - The chunker now follows each line's quotes and list items the way marked 17.0.6 reads them, and a raw block remembers the containers it opened in.
  - Attacking the fix with a differential fuzz against a whole-body marked parse found more problems, each fixed:
    - indented code read as prose after a cut;
    - a cut inside a list item losing the item (now reopened, except mid-paragraph, where the `.` start keeps a long paragraph linear);
    - `>` followed by a tab;
    - marked's rule that HTML interrupts a paragraph only unindented, outside list items.
  - Of 2,400 random 40 KB documents, the base leaked 2,085 Links and lost about 1,800. The fix leaks 5 and loses 7.
  - There are 22 variant tests at the package interface plus a bounded-time test.
- **`eval:diff --block` wrote over the spec #15 page.** A named block now writes `before-after.<name>.md`. Pipes inside table cells are escaped.
- **The runs.** All ran from c46854a with the bench's configuration committed: `retrieval-after` (both invocations), `retrieval-after-lexical`, and two reruns each, under both rankers, of the three rows that decide the embeddings rule. Then `retrieval-after-hop` over lexical-only.
- **The rules.**
  - Embeddings were cut. The van repair row passed lexical-only and failed hybrid in 2 of 3 runs; the cash row's flip did not hold; the means tied. Three non-retrieval rows regressed without searching. The default is now lexical-only, and `CLERK_RETRIEVAL_EMBEDDINGS=1` turns embeddings back on.
  - The Neighbourhood stays off: both of its rows already passed lexical-only.
  - Amendments are recorded on #48, #45 (109 sections, not 108) and #53.
- **Docs.**
  - The README now has the diagram box and Query edge, a Retrieval paragraph, the "Retrieval, measured" section with the generated block and a per-row table, and the limitations.
  - The evals page has a Retrieval section, and its counts read 25 Query rows, 73 total.

## Findings worth remembering

- **Verdicts here move on answer wording, not on retrieval.** The baseline already passed 7 of 8 retrieval rows. Clerk searched in only 4 to 6 of 25 rows per run. The neighbourhood rows were never searched, since the August statement's summary names its vendors.
- **The `kind` filter can hurt.** Dana Okafor's hybrid failure came from Clerk passing `kind: profile`, which kept the lease out of the Matches.
- **Embeddings did reach the semantic rows' Pages; keywords mostly did not.** The Index got Clerk there anyway. On a larger Wiki this could matter.
- **The worktree had no `node_modules`.** Bun silently resolved the main checkout's copy. Run `bun install --frozen-lockfile` first.
- **Gateway spend for all the live runs:** $14.93 to $12.66, so $2.27.

## What the human checked

Nothing yet. The PR is a draft.

## Open questions

- Whether a larger Wiki, or a Query prompt that searches more often, would let embeddings earn their place.
- Known and not fixed: an unclosed backtick run whose info string holds a backtick loses one Link (pre-existing).

## Artifacts

- Branch `ticket/63-retrieval-after-runs`.
- Runs under `docs/evals/runs/retrieval-after*`.
- `docs/evals/before-after.retrieval.md`.
