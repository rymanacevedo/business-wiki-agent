# 0001: Chart the wayfinder map

- **When**: 2026-10-17, morning
- **Agent**: Claude Code (Claude Fable 5.1)
- **Driving**: `/wayfinder` with the take-home brief (`instructions.md`) and a request to build on Vercel Eve

## Goal

Turn the focused.io take-home brief plus "use Vercel Eve" into a planning map that an agent can later implement from, splitting the work into decision tickets rather than charging at the build.

## What happened

1. **Read the brief and the Eve docs** (landing page, getting started, tools, evals, deployment, the full docs index) to learn what Eve gives us for free. Eve has native evals with deterministic matchers, trajectory checks, and an LLM judge, approval-gated tools, and OpenTelemetry tracing. It has no built-in retrieval, so the retrieval step is ours to write.
2. **Checked the machine**: Node 22 (Eve needs 24), no Vercel CLI, no model or tracing keys, `gh` logged in, Docker present, directory not yet a git repo.
3. **Round-one grilling** on the destination. Eight questions, each with a recommended answer. The human accepted all of them, with a 3-day budget, and redirected the problem: instead of support triage, an agent that keeps a small business's documents, receipts, identity, and compliance facts in an LLM-maintained wiki following Karpathy's "LLM wiki" gist. The human also asked for the GitHub issue tracker instead of local markdown.
4. **Ran the repo setup skill**: `git init`, created the GitHub repo (the permission classifier refused a public repo, so it is private until submission), wrote `docs/agents/` config and the Agent skills block, created triage and wayfinder labels.
5. **Created the map** ([Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1)) with the destination, standing decisions, fog, and out-of-scope lists, then thirteen child tickets wired with GitHub native blocking so the frontier is visible in the tracker UI.
6. **Fired four research subagents** in isolated worktrees, one per research ticket, each writing findings to a `research/<name>` branch and closing its own ticket.

## Findings worth remembering

- Decisions locked in round one: Eve native evals are the only harness; LangSmith for traces with Braintrust as fallback; one credential via Vercel AI Gateway; Claude Sonnet 5.5 as the agent model with a different-family judge; deploy to Vercel; extras are judge calibration, slices, trajectory evals, and tricky examples including prompt injection inside a document.
- Reviewers spend about 30 minutes and live in LangSmith; the brief rewards honest failures over perfect scores, so the eval story matters more than feature count.

## What the human checked

The human chose the problem, the time budget, the tracker, and confirmed every round-one recommendation. The agent chose the ticket breakdown and the blocking graph.

## Open questions

The human's problem sentence was terse ("stay compliant, keep their documents, receipts, their business advance, who they are"). The agent recorded its reading on the map and made sharpening it the first grilling ticket.

## Artifacts

- Commit `9d00846` (scaffold), map issue #1, tickets #2 to #14.
- Research branches: `research/eve-primer`, `research/eve-evals-harness`, `research/eve-traces-to-langsmith`, `research/wiki-persistence`.
