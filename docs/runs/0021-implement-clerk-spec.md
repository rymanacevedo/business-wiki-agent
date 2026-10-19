# 0021: Implement spec #15 (Clerk) across tickets #16–#30

- **When**: 2026-10-17 to 2026-10-19
- **Agent**: Claude Code (Opus 5.5) orchestrating implementer subagents in worktrees
- **Driving**: `/implement-spec` on [Spec: Clerk, the business wiki agent take-home submission](https://github.com/rymanacevedo/business-wiki-agent/issues/15)

## Goal

Implement every ticket of spec #15 on the integration branch `spec/15-clerk` (draft PR #31), then run the Codex integration review.

## What happened

- Worked the ticket graph frontier: one implementer subagent per ticket, each in its own worktree using the `tdd` skill, merged into `spec/15-clerk` after `bun run check` passed, with a status comment on each issue. Tickets stay open until PR #31 merges and closes them.
- **Free tier.** The Gateway key turned out to be free tier: every Anthropic model and every decision model returned 403. The human chose free models: the agent runs on `openai/gpt-5-mini`, and the judge is `mistral/mistral-medium-3.5` through a chat-judge adapter, because Eve's `decide()` takes only decision models. Spec #15 and tickets #18 and #21 were updated to match.
- **#20 fixtures** took several Clerk-built rebuilds. After the baseline tools were in, a follow-up rebuild fixed the known fixture defects and the 300K per-session token cap, which the #25 demo hit on its second message. Telling the model to batch its calls did not work; making the tools do more per call did. The demo's first two messages went from 269,751 to 134,688 input tokens.
- **#25 deploy.** Everything that runs locally was built and tested first. With the human's approval, the Blob store was created and the `demo` namespace seeded. The first `eve deploy` hit Vercel's free-plan limit of 5,000 file uploads a day, because `.vercelignore` did not exclude `.claude/` (the agent worktrees). Fixed in `.vercelignore`; a committed `vercel.json` layout was proven with a local `vercel build --prod`. The deploy retry is pending.
- **Evals:**
  - #21 built the harness.
  - #22 and #23 added the Query/Lint and Safety slices.
  - #26 tagged `eval-baseline` and ran it: 53/65.
  - #27 triaged the failures from their traces.
  - #28 applied exactly the triage's two agent fixes and four row corrections.
  - #29 ran the after run: 60/65, or 57/60 without the dataset-fix rows.
  - #30 wrote the README and the submission docs.

## Findings worth remembering

- `eve deploy` and `vercel blob create-store` rewrite `.env.local` with the Vercel development env, which resets `LANGSMITH_PROJECT` to `business-wiki-agent-development`. Restore `business-wiki-agent-local` afterwards.
- Eval rows that end parked on an unanswered Approval leave no LangSmith trace.
- The free judge is saturated: 53 of 56 baseline judgments were 1.0. It is uncalibrated until the Owner labels `docs/evals/runs/before/calibration.yaml`.
- Per-ticket detail lives in the implementers' run notes outside the repo (`clerk-notes/runlog-*.md`); this entry is their summary.

## What the human checked

- Chose the free-tier models and the free judge.
- Approved letting implementers fix model mistakes instead of only logging them.
- Accepted the fixtures (#20 AC7).
- Approved the session-cap fix, the fixture rebuild, and the Vercel steps.
- Ran `vercel blob create-store` themselves after the permission check blocked it.

## Open questions

- Production deploy, health check, and trace verification (#25 ACs 6–7), waiting on Vercel's upload limit.
- Calibration labels, README `<deployed-url>` and trace share links, the "What I checked myself" list, the pitch sign-off.
- "Ingest everything new" is still failing; three new after-run failures may be variance (see `docs/evals/triage.md`).

## Artifacts

- Branch `spec/15-clerk`, draft PR #31, tag `eval-baseline`
- `docs/evals/triage.md`, `docs/evals/before-after.md`, `docs/evals/calibration.md`, `docs/submission-checklist.md`
