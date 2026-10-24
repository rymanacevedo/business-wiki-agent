# 0050: Synthesise the submission spec and ticket graph

- **When**: 2026-10-23
- **Agent**: Claude Code, Opus 5.5
- **Driving**: [Task: synthesise the submission spec and ticket graph](https://github.com/rymanacevedo/business-wiki-agent/issues/82), on the map [the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/76)

## Goal

Work the last frontier ticket on the submission-README map: turn its decisions into a spec and a ticket graph that `implement-spec` can run.

## What happened

- The agent read the skeleton, the resolutions of the four closed decision tickets and the run-log research. It then put six questions to the Owner, and a seventh once the spec was drafted. The Owner accepted every recommendation.
- **The graph:** five tickets. The README is one ticket, because it's one file and slicing it would only create merge conflicts. The moves into `docs/` block it, so no fact is missing at any commit. So do the run entries, so the Build cost cell can cite them.
- **The local branch:** `wayfinder/49-eval-story` also carries an unpushed change to the review process doc that switches the build to one PR per ticket. Only its three run files come to `main`. The process change stays the Owner's, and the build runs under the flow on `main`.
- **One scope exception:** triage's Eastside narration is rewritten as "judge right, checks blind". Otherwise the README would link to a narration that contradicts it.
- **Known failures:** eight bullets rather than seven. Dana Okafor's miss is its own bullet, and the fixture defect folds into the judge bullet.
- **Verification uses no new test code:**
  - `eval:diff` leaves `README.md` byte-identical;
  - links and anchors resolve;
  - the line budget holds;
  - `grep -c 'submission-day' README.md` prints 7;
  - `bun run check` passes.
- Published the spec and five tickets, wired the blocking edges, closed the task, and cleared the map's fog. Nothing is left to decide on the map.

## Findings worth remembering

- Two of the three run entries on `wayfinder/49-eval-story` (0031, 0042) exist only in the Owner's local checkout. [The unpushed run entries land on main](https://github.com/rymanacevedo/business-wiki-agent/issues/92) can't run on a fresh clone.
- `docs/evals/README.md` links to `../../README.md#retrieval-measured`, which the rewrite removes. The moves ticket retargets it.
- The decision on headlines said "five to seven" bullets for Known failures, while the trace confirmation added one bullet and one link. Later decisions can quietly break an earlier budget, so the spec states the new count.

## What the human checked

The Owner decided the breakdown, the scope of the copy from the local branch, the build flow, the triage exception, the verification checks, keeping the draft for "What I checked myself", and the eight bullets.

## Open questions

- Whether the map issue should be closed now that its way is clear. The agent left it open for the Owner.

## Artifacts

- [Spec: the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/90), with its tickets [docs/ receives the README content that exists nowhere else](https://github.com/rymanacevedo/business-wiki-agent/issues/91), [The unpushed run entries land on main](https://github.com/rymanacevedo/business-wiki-agent/issues/92), [The per-run index in the run log](https://github.com/rymanacevedo/business-wiki-agent/issues/93), [The README rewritten as the submission](https://github.com/rymanacevedo/business-wiki-agent/issues/94) and [The submission checklist rewritten in place](https://github.com/rymanacevedo/business-wiki-agent/issues/95).
- [Task: synthesise the submission spec and ticket graph](https://github.com/rymanacevedo/business-wiki-agent/issues/82) (closed), with its resolution comment.
