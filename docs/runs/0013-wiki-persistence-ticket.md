# 0013: Resolve the wiki persistence and deployment shape ticket

- **When**: 2026-10-18
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Wiki persistence and deployment shape](https://github.com/rymanacevedo/business-wiki-agent/issues/11)

## Goal

Work through the map: take the next frontier ticket and resolve it. The ticket asked where the Wiki lives at runtime, what the deployed demo looks like, how evals get a fresh Wiki, and whether Ingest uses subagents.

## What happened

1. Queried the frontier (persistence and eval design open and unblocked); claimed the persistence ticket as first in map order.
2. Gathered facts before asking anything: the persistence research, the Eve primer's deploy and auth sections, the trust ticket's tool table, the schema prototype amendment, and the live Vercel account (Hobby plan, project linked, no Blob store). Hobby's Blob cap of 2,000 advanced operations a month became the constraint that keeps evals off the deployment.
3. Round 1, eight questions: storage (Design A, local directory plus private Blob), Sources pre-placed with a `list_sources` tool and an **Inbox** term, demo start state (mostly Ingested with Approval-requiring Sources held back), surface (Next.js chat plus a read-only wiki browser), route protection, local-only evals with per-session namespaces, single agent, reset by script. The human accepted seven and overturned route protection: no auth, declared as a security gap.
4. Round 2, three questions: one seed per `eve eval` invocation via `WIKI_SEED` because tools cannot see which case made a session; per-session cost and token caps standing in for auth; the seed fixture built by running Clerk itself over the Corpus minus the Inbox set. All accepted.
5. Recorded the storage choice as ADR 0001 (hard to reverse, surprising without the research, a real trade-off against the sandbox). Posted the resolution with four implied eval cases, closed the ticket, appended the gist to the map, added three Out-of-scope lines (route auth, chat upload, subagents), and left a context comment on the eval-design ticket.

## Findings worth remembering

- Holding back exactly the Sources whose Ingest needs an Approval does two jobs: the fixture build script never blocks on a human, and the demo reaches an Approval card in two messages.
- Per-case seeding is not reachable from tools without polluting trajectories, so seed selection has to be per invocation; slices therefore run as separate `eve eval` commands and the diff script must merge results.
- The production namespace must not come from the caller's principal: with no auth every caller is the same principal anyway, and with one Business there is nothing to partition.
- An open demo URL on Hobby exposes Gateway credit, not data; session cost caps bound it cheaply.

## What the human checked

- Overturned the recommendation on route protection and chose to ship the URL open as a documented gap; the agent's recommendation (shared HTTP Basic credential) is recorded in the resolution as the fix.
- Accepted the remaining ten recommendations as proposed.

## Open questions

- Whether the in-process eval server inherits env set in `setup()` (the research's open question); the implementing agent should smoke-test it before relying on `WIKI_SEED` and the run directory.
- Blob read latency from `iad1` is unmeasured; the research suggested measuring once on day 2.
- Whether the browser's same-origin cookie handling matters at all now that no auth is in the walk; revisit only if auth is added.

## Artifacts

- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/11#issuecomment-6245731359
- Eval-design context: https://github.com/rymanacevedo/business-wiki-agent/issues/12#issuecomment-6245731655
- `docs/adr/0001-wiki-in-app-runtime-store-not-sandbox.md`, `GLOSSARY.md` (Inbox added), this run file.
