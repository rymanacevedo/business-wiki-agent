# 0054: Implement spec #90 (the submission README) across tickets #91–#95

- **When**: 2026-10-23
- **Agent**: Claude Code, Opus 5.5 (orchestrator), with implementer and merger subagents
- **Driving**: [Spec: the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/90)

## Goal

The Owner ran `implement-spec` on spec #90 under the flow on `main`: one integration branch, `spec/90-submission-readme`, starting at `590b558`, with ticket worktrees, merger subagents and a final Codex review.

## What happened

- First, the session merged run entry 0050 into `main` as PR #96, so the build started from a `main` that held the spec's own run.
- **The graph:** [docs/ receives the README content that exists nowhere else](https://github.com/rymanacevedo/business-wiki-agent/issues/91), [The unpushed run entries land on main](https://github.com/rymanacevedo/business-wiki-agent/issues/92) and [The submission checklist rewritten in place](https://github.com/rymanacevedo/business-wiki-agent/issues/95) ran in parallel. [The per-run index in the run log](https://github.com/rymanacevedo/business-wiki-agent/issues/93) started once #92 merged, and [The README rewritten as the submission](https://github.com/rymanacevedo/business-wiki-agent/issues/94) once #91 merged. Each ticket merged with no conflicts.
- **The integration branch has its own worktree**, `.claude/worktrees/integration-90`. Partway through the session, something outside it switched the main checkout from `docs/run-entry-0050` to `main`. So nothing in the build touched the main checkout.
- **#92:** 0027, 0031 and 0042 from `wayfinder/49-eval-story` landed as 0051, 0052 and 0053. The implementer had rewritten 0053's credit line to state "$3.77". The orchestrator restored the line word for word and put the derived figure ($16.43 − $12.66) in the "Originally" note instead, so the copy stays a faithful record.
- **#91:** the moves are word for word. The deny narration needed no correction, because it never said the INGEST line records the denial. The README's "judge is uncalibrated" limit didn't move, since the evals page's Calibration section already says it.
- **#93:** every one of the 53 run files has exactly one line. Where an entry landed twice (0042–0045 copy 0025, 0028 and the two reviews; 0047 copies the 0043 skeleton), the first-committed file gets the full line and the copy is marked _Thin_.
- **#94:** 207 lines outside `<details>`, and seven placeholders. The four trace URLs are reference definitions under Traces, so the narrations share them and the count stays at seven rather than ten. The generated blocks sit inside `<!-- prettier-ignore-start/end -->`, because the pre-commit Prettier pass reformats `eval:diff`'s tables. Without the wrapper, even the old README failed the byte-identity check. `scripts/eval-diff.ts` didn't change.

- **The final Codex review** passed both axes with no blockers. Its one advisory was right: triage's Eastside narration said the `demo` Wiki was unaffected by the rotor error, but the checklist and the Quickstart seed `demo` from `fixtures/full`, which carries it. The sentence now says so, and the review was rerun on the fix.

## Findings worth remembering

- `eval:diff` also rewrites `docs/evals/before-after.md` and `docs/evals/before-after.retrieval.md`, which were already out of sync with what it writes. The retrieval page isn't in `.prettierignore`. Each check run here restored both files afterwards.
- The `query-dana-okafor` Known failures bullet has no issue, so it links its evidence in `docs/evals/README.md#the-four-runs`.
- The checklist names README parts by heading and link-definition label (`[trace-happy]:` and the rest). Renaming a README section means updating `docs/submission-checklist.md` too.

## What the human checked

The Owner chose to run the spec and asked for the integration PR to go through `/pr`. Every decision the build rests on was made earlier, in the spec and its tickets. The calls listed above were the agents', and they are open for the Owner to overturn in review.

## Open questions

- Whether to file an issue for `query-dana-okafor`, so its bullet can link one like the other seven.
- Whether the duplicate run entries (0042–0045, 0047) should be deleted rather than marked _Thin_ in the index.
- Whether the map, [the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/76), closes once PR #97 merges.

## Artifacts

- Branch `spec/90-submission-readme`, PR #97 (closes #90–#95). The final Codex review uses base `590b558`.
- Ticket merges: #92 `d002d37` (plus `56a9c00`), #95 `f434445`, #91 `62c202e`, #93 `5d988ba`, #94 `cbd239a`.
