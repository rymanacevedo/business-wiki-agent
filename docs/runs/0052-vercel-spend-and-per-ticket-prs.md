# 0052: Vercel spend on spec #15, and one PR per ticket for the next spec

- **When**: 2026-10-23
- **Agent**: Claude Code (Fable 5.1)
- **Driving**: ad hoc: "before we run implement spec, check how much was used on Vercel during #15, and I want separate PRs per ticket instead of one large PR"

Originally 0031 on `wayfinder/49-eval-story`.

## Goal

Report what the implementation of [Spec: Clerk, the business wiki agent take-home submission](https://github.com/rymanacevedo/business-wiki-agent/issues/15) cost on Vercel, and change the `implement-spec` flow so the retrieval spec ships as a PR per ticket.

## What happened

1. **Spend.** Asked the AI Gateway credits endpoint (`/v1/credits`) with the project key: $13.57 used of $15.00 lifetime, $1.43 left. The Gateway has no per-window API, so the #15 window (2026-10-17 to the PR #31 merge, 2026-10-21T03:01Z) was bounded from LangSmith `runs/stats`: the evals project traced 379 root runs, 32.2M tokens (30.4M prompt, 1.9M completion), $5.57 at LangSmith's prices; production $0.02 (4 turns); local $0.01. Since the merge: one production turn, $0.005. The gap between $13.57 and the $5.60 traced is untraced spend (fixture rebuilds, implementer live runs in worktrees without the LangSmith key, seeding) plus LangSmith pricing the free judge at zero, so the traced figure is a floor and the Gateway figure is the real one. Vercel platform usage (functions, Blob, bandwidth, the Pro upgrade) has no CLI or public API; it is on the dashboard only. Deployments: 7 production deploys, matching the run log.
2. **Per-ticket PRs.** Rewrote `docs/agents/integration-review.md` from the integration-branch handoff into a per-ticket PR flow: branch `ticket/<issue>-<slug>` per ticket, stacked on the blocking ticket's branch when the blocker is unmerged, one draft PR per ticket with `Closes #<issue>`, the Codex gate run per PR with `--base` set to the PR's base, two automatic repair rounds per PR, the agent marks ready and the human merges. The retrieval tickets form a chain (54 → 55 → 56 → four parallel tickets → 63), so stacking is what lets the frontier keep moving. Updated the AGENTS.md pointer to say the doc overrides the skill's integration-branch steps. The global `implement-spec` skill (`~/.agents/skills`, synced) was left alone.

## Findings worth remembering

- `GET https://ai-gateway.vercel.sh/v1/credits` with the Gateway key returns `balance` and `total_used`; it is the only programmatic spend figure Vercel exposes for the Gateway.
- LangSmith `POST /api/v1/runs/stats` with `session`, `start_time`, `end_time`, `is_root` gives per-project tokens and cost for a window; it rate-limits after about five calls, so space them.
- One full 65-row eval run cost roughly $0.70 to $1.00 on the free models (eight run directories under `docs/evals/runs/` for $5.57). The retrieval spec needs at least a before run (#54), a bench (#60) and after runs (#63); the $1.43 balance will not cover it.

## What the human checked

- Nothing yet: this session reports to the human. The merge policy (agent marks ready, human merges unless told otherwise) is the agent's reading of "I want separate PRs per ticket".

## Open questions

- Whether to top up the Gateway before `implement-spec`, and by how much.
- Whether the human wants to merge each ticket PR themselves or have the agent merge as the gate passes.
- Vercel platform usage for the window still needs a dashboard read.

## Artifacts

- `docs/agents/integration-review.md`, `AGENTS.md`, this entry. Not committed.
