# business-wiki-agent

Take-home exercise for focused.io: an agent a small business would trust to keep its documents, receipts, and compliance facts in an LLM-maintained wiki (Karpathy's "LLM wiki" pattern), built on Vercel Eve with evals, traces, and a before-and-after evaluation loop.

Brief: `instructions.md`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues at `rymanacevedo/business-wiki-agent` (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

Packages are deep modules: read [packages/README.md](./packages/README.md) before adding or importing one.

## Run log

End every session by adding a run entry under `docs/runs/`: format and template in `docs/runs/README.md`. The human retells the build from these at the interview.

## Integration reviews

When running `implement-spec` or preparing its integration PR for review, follow
[the Codex review handoff](docs/agents/integration-review.md). Use the local
`code-review` skill for review and `pr` skill for PR descriptions.

## Eve

Clerk is an Eve `0.80.1` agent under `agent/` (pinned exactly; do not upgrade
mid-build). Before writing tools, channels, evals, or deployment code, read
`node_modules/eve/docs/README.md`: it maps each task to the page for the
installed version. `npx eve info --json` lists discovered tools and diagnostics.
Run locally with Node 24 and `AI_GATEWAY_API_KEY` in `.env.local`:
`bun run wiki:seed --ns demo --fixture prototype --force`, then `bun run dev`.
