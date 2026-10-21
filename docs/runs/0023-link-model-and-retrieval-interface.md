# 0023: Decide the Link model and the retrieval interface

- **When**: 2026-10-21
- **Agent**: Claude Code (Claude Fable 5.1)
- **Driving**: [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42), ticket [The Link model and the retrieval interface](https://github.com/rymanacevedo/business-wiki-agent/issues/46)

## Goal

Work the map's next frontier ticket: decide which Wiki relations become Links and what the one interface of the Retrieval module is, so the prototype and seam tickets can proceed.

## What happened

1. Loaded the map and queried its children: three research tickets closed, one grilling ticket unblocked, the rest blocked behind it. Claimed the ticket before reading anything else.
2. Read the three research notes (Gateway embeddings, retrieval cache, lexical ranking), the GLOSSARY, the Schema, and one fixture Page of each kind to see the Link shapes as text rather than as the map's counts.
3. Grilled in two rounds, twelve questions, each with a recommended answer; the human accepted every recommendation. Round one covered the Link kinds, direction, the summary-as-hub rule, the hop budget, caps, exclusions, input and output shape, and the name Match. Round two, unblocked by the hop budget, covered Neighbourhood ordering, `via` attribution, and the one-section excerpt rule.
4. Updated the GLOSSARY inline as terms settled: added **Match**, sharpened **Link** to the four kinds and two-way traversal, sharpened **Neighbourhood** to one Link away. No ADR: the Link model is cheap to reverse and the "no graph database" decision already sits on the map.
5. Posted the resolution on the ticket, closed it, appended the gist to the map's Decisions-so-far, and removed the degrade-path line from Not yet specified because it already lives as the seam ticket. No new tickets: the open research questions (kind prior, stemming, date spelling, tuning) belong to the eval ticket, rendering to the prototype, caching and Lint callers to the seam.

## Findings worth remembering

- Obligations carry `counterparty` on all 10 fixture Pages; the ticket body listed only `vendor`. Both resolve to an entity Page and are one Link kind (`party`).
- Every "Also seen in" line ends in a `(src: id)` Citation, so it needs no Link kind.
- The fixture's one `superseded_by` is the Schema's own mention. No fixture Page is superseded yet, so that Link kind is exercised by Schema rule only; the eval fixture will need a superseded Page before that kind is tested.
- The density argument decided two things: no "shares a Source" shortcut and a one-hop budget. A bank statement cited by six Records would otherwise make all six neighbours of each other.
- The local `research/lexical-ranking` branch has no commits beyond `main`; the research note is only on the remote branch.

## What the human checked

The human took every recommendation as offered. The facts behind them (Link counts, Page shapes, fixture contents) came from the repo, not from the human.

## Open questions

- How many `via` Links the prototype shows the model per neighbour (the module keeps all of them).
- Whether the fixed kind prior (profile, obligation, summary, entity, ledger) should also boost Matches; the eval ticket decides after a baseline.

## Artifacts

- Ticket resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/46
- Map update: https://github.com/rymanacevedo/business-wiki-agent/issues/42
- `GLOSSARY.md` (Link, Match, Neighbourhood)
- Branch `wayfinder/46-link-model` (this entry and the GLOSSARY change; not pushed)
