# 0021: Implement spec #15 (Clerk) across tickets #16–#30

- **When**: 2026-10-17 to 2026-10-20
- **Agent**: Claude Code (Opus 5.5) orchestrating implementer subagents in worktrees
- **Driving**: `/implement-spec` on [Spec: Clerk, the business wiki agent take-home submission](https://github.com/rymanacevedo/business-wiki-agent/issues/15)

## Goal

Implement every ticket of spec #15 on the integration branch `spec/15-clerk` (draft PR #31), then run the Codex integration review.

## What happened

- Worked the ticket graph frontier: one implementer subagent per ticket, each in its own worktree using the `tdd` skill, merged into `spec/15-clerk` after `bun run check` passed, with a status comment on each issue. Tickets stay open until PR #31 merges and closes them.
- **Free tier.** The Gateway key turned out to be free tier: every Anthropic model and every decision model returned 403. The human chose free models: the agent runs on `openai/gpt-5-mini`, and the judge is `mistral/mistral-medium-3.5` through a chat-judge adapter, because Eve's `decide()` takes only decision models. Spec #15 and tickets #18 and #21 were updated to match.
- **#20 fixtures** took several Clerk-built rebuilds. After the baseline tools were in, a follow-up rebuild fixed the known fixture defects and the 300K per-session token cap, which the #25 demo hit on its second message. Telling the model to batch its calls did not work; making the tools do more per call did. The demo's first two messages went from 269,751 to 134,688 input tokens.
- **#25 deploy.** Everything that runs locally was built and tested first. With the human's approval, the Blob store was created and the `demo` namespace seeded. The first `eve deploy` hit Vercel's free-plan limit of 5,000 file uploads a day, because `.vercelignore` did not exclude `.claude/` (the agent worktrees). Fixed in `.vercelignore`; a committed `vercel.json` layout was proven with a local `vercel build --prod`. The human upgraded Vercel to Pro, and the deploy went through: https://business-wiki-agent.vercel.app, with the health check, a curl turn, and production traces verified. At the human's request the site is kept out of search engines (robots meta tag, `robots.txt`, and an `X-Robots-Tag` header).
- **Evals:**
  - #21 built the harness.
  - #22 and #23 added the Query/Lint and Safety slices.
  - #26 tagged `eval-baseline` and ran it: 53/65.
  - #27 triaged the failures from their traces.
  - #28 applied exactly the triage's two agent fixes and four row corrections.
  - #29 ran the after run: 60/65, or 57/60 without the dataset-fix rows.
  - #30 wrote the README and the submission docs.
- **Integration review, round 1** (head 07917e6) found five blocking problems and one advisory. Each was fixed in its own repair branch, from a failing test:
  - repair-1: an inline-YAML payment edit skipped the Approval; the Source browser showed unmasked identifiers.
  - repair-1b: "ingest everything new". Every INGEST result names the Inbox Sources left, and a prose-only payment proposal can't close an Ingest. It passed 3 of 3 live runs.
  - repair-1c: `fixtures/full` lacked the 2027-01-31 sales-tax filing Obligation (and the fiscal-year Profile line), corrected by hand rather than rebuilt. The human chose to fix it instead of listing it.
  - The deploy finding was closed by the deploy above.
- An **after-repairs** run of both seeds scored 61/65, kept apart from the recorded before/after. It showed a new variance failure: the approved Supersession stopped after its Approval.
  - repair-1d tried a dynamic instruction; Eve 0.80.1 resolves those only at turn start, so it became a step-scoped dynamic tool. Dropped: it broke the prompt cache and missed the first step after the resume.
  - repair-1e puts the note in the approved `change_fact` result instead, and fixes the turn helpers, which took Eve's "[Pending approvals]" message for the Owner's. It passed 3 of 3 live runs.
- The edge cases left open became follow-up issues #32–#38.
- **Integration review, round 2** (head 51131e7) found two blocking problems, fixed in repair-2 (the last automatic round), test-first:
  - The Contradiction guard kept only a fact's numbers, so "Sam Rivera (sole Member; 100% membership interest)" could be rewritten without an Approval. A Conflict must now state the complete original claim, value and Citation, word for word. The refusal names the exact claim to keep, after a live run showed Clerk trimming it.
  - Masking missed a 4-6-5 card number and masked a bare 10-digit phone. It now masks by label, card grouping, and Luhn checksum; phones and the EIN stay clear. The masked values across all 36 Sources are unchanged.
  - The demo was redeployed with both fixes.

## Findings worth remembering

- `eve deploy` and `vercel blob create-store` rewrite `.env.local` with the Vercel development env, which resets `LANGSMITH_PROJECT` to `business-wiki-agent-development`. Restore `business-wiki-agent-local` afterwards.
- Eval rows that end parked on an unanswered Approval leave no LangSmith trace.
- Eve 0.80.1 resolves dynamic instructions only at `session.started` and `turn.started`; an Approval resumes the same turn. To speak to the model right after a resume, put the text in the approved tool's result.
- Eve adds a user-role "[Pending approvals]" message (`kind: context.state`) when a turn parks; it is not a turn boundary.
- `next dev` with `withEve` starts its own eve dev server, which blocks `eve eval` in the same checkout.
- The free judge is saturated: 53 of 56 baseline judgments were 1.0. It is uncalibrated until the Owner labels `docs/evals/runs/before/calibration.yaml`.
- Per-ticket detail lives in the implementers' run notes outside the repo (`clerk-notes/runlog-*.md`); this entry is their summary.

## What the human checked

- Chose the free-tier models and the free judge.
- Approved letting implementers fix model mistakes instead of only logging them.
- Accepted the fixtures (#20 AC7).
- Approved the session-cap fix, the fixture rebuild, and the Vercel steps.
- Ran `vercel blob create-store` themselves after the permission check blocked it.
- Upgraded Vercel to Pro to get past the upload limit, and asked for the site to be kept out of search engines.
- Chose to fix "ingest everything new" and the `full` fixture rather than list them, and picked the `change_fact` result as the carrier for the unfinished-Ingest note.
- Asked for the edge cases to become their own tickets.

## Open questions

- Calibration labels, trace share links, the "What I checked myself" list, the pitch sign-off.
- Follow-ups #32–#38, among them the unexplained session token budget (#34) and the Bayview Contradiction proposed as a change (#33).

## Artifacts

- Branch `spec/15-clerk`, PR #31, tag `eval-baseline`, deployed demo https://business-wiki-agent.vercel.app
- `docs/evals/runs/after-repairs/`, `docs/evals/runs/repair-1b/`, `docs/evals/runs/repair-1e/`, `docs/evals/runs/repair-2/`
- `docs/evals/triage.md`, `docs/evals/before-after.md`, `docs/evals/calibration.md`, `docs/submission-checklist.md`
