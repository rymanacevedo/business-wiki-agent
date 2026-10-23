# 0024: Prototype the retrieval result as the model sees it

- **When**: 2026-10-21 to 2026-10-23
- **Agent**: Claude Code (Claude Fable 5.1)
- **Driving**: [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42), ticket [Prototype: the retrieval result as the model sees it](https://github.com/rymanacevedo/business-wiki-agent/issues/47)

## Goal

Work the map's next frontier ticket: build the throwaway script the ticket asks for, run lexical entry plus Link expansion over `fixtures/full`, put a concrete result in front of the human, and record their reaction as the ticket's resolution.

## What happened

1. Loaded the map and its children: four closed, three open and unblocked (the prototype, the seam, the eval story), the synthesis task blocked behind all three. Claimed the prototype ticket, the first in map order, before any reading.
2. Read the lexical-ranking research (tokeniser, sectioning, BM25 parameters, the appendix code), the Link-model resolution, the GLOSSARY, the current `search_wiki` tool, the wiki-links and wiki-store entry points, and one fixture Page of each kind.
3. Wrote `scripts/prototype-retrieval-result.ts`: the research BM25 reproduced, the four Link kinds derived from Page text and frontmatter, two-tier ordering per the decision, three renderings with character and token estimates, and a line per Query showing which Neighbourhood Pages plain lexical top 8 would not have shown. No store, no cache, no embeddings; reads the fixture directory.
4. First run exposed three defects and one finding. Defects: `via` listed the same Match twice when two Pages link each other both ways; `title:` and `sources:` frontmatter lines won the excerpt slots; the Profile and the Ledgers flooded the Neighbourhood through their forward Citations. Finding: the decided Neighbourhood ordering never discriminated, because almost every neighbour is reached by exactly one Match.
5. Added flags rather than silently changing the rules, so every behaviour stays reproducible: excerpt candidates (all lines versus fact lines), Link scope (Page versus matched section), padding, Neighbourhood rule (decided count versus degree-weighted), a neighbour floor, a Match floor, and a `--matrix` mode that prints the Neighbourhood under five configurations side by side.
6. Ran eight Queries (the ticket's two, three from `questions.yaml`, three added to probe the hop). Captured four runs and committed the script with them to the throwaway branch `prototype/retrieval-result`, pushed, no PR.
7. Posted the findings and six reaction questions on the ticket and stopped for the human.
8. The human answered in one line: Variant A, and keep it experimental until the evals show benefit. Recorded that as the resolution: Variant A is the rendering; the Neighbourhood hop ships behind a module switch and earns its place only through the before-and-after evals. Made one routine call from the prototype's own evidence (frontmatter title and sources lines are never excerpt lines; pad to three) and sent the rest where the map already puts tuning: ordering, Match floor and kind prior to the eval ticket, the switch and its wording to the seam ticket.
9. Closed the ticket, appended the gist to the map, and added an "Inputs from the prototype" paragraph to the seam and eval tickets so the next sessions start with the evidence. No fog graduated and no new ticket: the open questions all belong to tickets that already exist. Deleted the untracked copy of the script; the prototype branch keeps it.

## Findings worth remembering

- A retrieval result is 300 to 700 tokens; a `read_page` of the Profile is about 1,700. Size against the 300K session cap and the 8-call limit is a non-issue; precision is the question.
- On this fixture the hop rarely adds a Page the answer needs: vendor and counterparty slugs and titles put the Query's terms on every related Page, so Matches already cover the Neighbourhood. The hop's value will have to be shown by embeddings and the before-and-after evals, or by Queries whose wording shares no term with the answer Page.
- The two Neighbourhood rules pull opposite ways: degree weighting promotes the bank statement that corroborates a receipt, but demotes the right receipts when the bank statement itself is the question. Neither dominates.
- Section-scoped forward Links lose "Also seen in", which is its own section on every Expense Record.
- Frontmatter `title:` and `sources:` lines must stay in the indexed text (they carry the vendor slug) but must not be excerpt candidates.
- A Match floor at a third of the top score removes the noise fifth Match cleanly; the score gap is large (11.2 to 2.9) on the one Query it mattered.
- Entity Pages outrank the invoice and the Obligation for vendor Queries; evidence for the eval ticket's kind-prior question.
- `origin/main` already holds PR #51 (the Link-model session), so this entry starts a fresh branch from it; the uncommitted edit to run entry 0022 in the working tree belongs to another session and was left alone.

## What the human checked

The human read the ticket comment and chose the rendering (Variant A) and the hop's status (experimental until evals show benefit). The excerpt rule, the routing of ordering and floors to the eval ticket, and the switch to the seam ticket are the agent's calls, made from the prototype output and the map's existing ownership of tuning questions.

## Open questions

- Which Neighbourhood ordering wins, and whether a Match floor helps: the eval ticket measures it.
- The name and default of the hop switch: the seam ticket.
- A better word than "names party" for the backward `party` label.

## Artifacts

- Prototype branch: https://github.com/rymanacevedo/business-wiki-agent/tree/prototype/retrieval-result (script plus `docs/prototypes/retrieval-result/` captured runs and README)
- Ticket comment: https://github.com/rymanacevedo/business-wiki-agent/issues/47
- Branch `wayfinder/47-retrieval-result` (this entry)
- Ticket resolution and close: https://github.com/rymanacevedo/business-wiki-agent/issues/47
- Map update: https://github.com/rymanacevedo/business-wiki-agent/issues/42; inputs added to https://github.com/rymanacevedo/business-wiki-agent/issues/48 and https://github.com/rymanacevedo/business-wiki-agent/issues/49
