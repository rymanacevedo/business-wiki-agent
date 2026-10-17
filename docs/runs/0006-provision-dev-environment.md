# 0006: Provision the dev environment and credentials

- **When**: 2026-10-17
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Task: provision the dev environment and credentials](https://github.com/rymanacevedo/business-wiki-agent/issues/7)

## Goal

Work through the map: take the first frontier ticket. It was the provisioning task, so do the machine-side work and hand the human a wizard for the account and key steps.

## What happened

- Loaded the map and queried the frontier: five open, unblocked, unclaimed tickets (provision task, seed corpus, trust boundaries, schema prototype, persistence shape). Took the provision task because it is first in map order and every build step waits on it. Claimed it by assignment before any work.
- Found Node 24.21.0 already installed under nvm but Node 22 set as default, which is exactly the state that made `eve init` fail in the primer research. Set the nvm default to 24 rather than installing again.
- Installed Vercel CLI 64.5.0 globally under Node 24. npm blocked esbuild's postinstall script; checked that esbuild still loads from the CLI's node_modules, so no action needed.
- Scaffolded a scratch Eve project with `npx eve@latest init --non-interactive` to prove the toolchain: exit 0, eve ^0.80.1 pinned by the scaffold, `engines.node` 24.x. Discarded the scratch directory.
- Added `.env*`, `.vercel/`, `.eve/` to `.gitignore` before any secret could exist, matching what the Eve scaffold ignores.
- Wrote `scripts/setup-credentials.sh` with the `wizard` skill: toolchain check, Vercel login, project link, AI Gateway key, LangSmith key and tracing project, optional Braintrust fallback, verify. Each secret goes to `.env.local` and to the Vercel project env for all three environments; both key stages try a live API check and warn rather than fail. Left Vercel Blob out on purpose: that store is a decision for the persistence ticket, not a prerequisite.
- Posted a progress comment on the ticket and handed the wizard to the human.
- The human ran the wizard in their own terminal and completed every stage, including the optional Braintrust one. A second copy launched through the session's `!` runner had no terminal and sat on the Vercel device-login prompt; killed it.
- Verified the results without printing values: Vercel login and project link present, four secrets on the Vercel project env, Gateway key lists 474 models including the agent model and both judge candidates, LangSmith and Braintrust keys accepted.
- Found the LangSmith variable pointed at a project that did not exist: the human had created four per-environment projects instead of one. Re-pointed `LANGSMITH_PROJECT` to match (local, production, staging for preview, development) rather than ask them to delete projects they chose on purpose.
- Posted the resolution comment, closed the ticket, appended the decision to the map, and refreshed the map's stale environment facts line.

## Findings worth remembering

- The shell aliases `rm` to `gio trash`, so `rm -rf` fails in scripts; use `command rm`.
- nvm lives at `~/.config/nvm`, not `~/.nvm`; `.bashrc` sources it, so `nvm alias default 24` is enough for new shells.
- Vercel CLI 64 supports `vercel env add NAME production,preview,development --sensitive --force --yes` with the value on stdin, which is what the wizard uses.
- The AI Gateway OpenAI-compatible endpoint (`https://ai-gateway.vercel.sh/v1/models`) and LangSmith's `GET /api/v1/sessions` work as cheap key checks; both confirmed live.
- The wizard cannot run through the session's `!` runner: it has no terminal, so `vercel login` blocks forever. Run it in a real terminal.
- `vercel link` writes `.env.local` itself with a `VERCEL_OIDC_TOKEN`; the wizard's `write_env` appended to that file cleanly.

## What the human checked

The human created the Vercel account state, the AI Gateway key, the LangSmith account and its four tracing projects, and the Braintrust key, and ran the wizard end to end. The agent only verified the keys reach their APIs.

## Open questions

- Whether per-environment LangSmith projects are what the submission story wants, or whether reviewers should see one project. Revisit in the submission-story ticket.
- A Vercel Blob store is still unprovisioned; it waits on the persistence ticket.

## Artifacts

- `scripts/setup-credentials.sh`, `.gitignore`, this run log.
- Resolution and progress comments on [Task: provision the dev environment and credentials](https://github.com/rymanacevedo/business-wiki-agent/issues/7).
