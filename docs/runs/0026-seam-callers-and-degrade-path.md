# 0026: Decide the seam, its callers, and the degrade path

- **When**: 2026-10-23
- **Agent**: Claude Code (Fable 5.1)
- **Driving**: [The seam, its callers, and the degrade path](https://github.com/rymanacevedo/business-wiki-agent/issues/48) on [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42)

## Goal

Work the next frontier ticket of the retrieval map: where the Retrieval module sits, who calls it, how its cache stays current on both store backends and under evals, and what the tool says when embeddings are unavailable.

## What happened

1. Loaded the map and its children; the frontier held two grilling tickets, and the seam ticket came first in map order. Claimed it, then read the Link-model and prototype resolutions, the three research notes on their branches, and the code the decision touches: `search_wiki`, the store and both backends, the write tools, the Lint skill, eval seeding.
2. Four facts from the code set the frame: `wiki(ctx)` builds a fresh store per tool call and hides its namespace, so a memo cannot live in the store; the Blob SDK already returns etags on `list` that the backend drops; Lint is a Markdown skill and can only reach retrieval through a tool, while the new result caps Matches at five; seeding copies every fixture file verbatim and `validatePage` knows only the eight Page folders.
3. Grilled in two rounds, sixteen questions, each with a recommendation; the human accepted all of them. Round one fixed the package and its factory, the `manifest` method and lazy etag validation with write tools untouched, lazy delta embedding inside `search` (a refinement of the charting note "computed at write time": the whole Wiki is embedded only when a fixture is built), the hidden `cache/` prefix, Lint's move to a new `list_flagged` tool, the `neighbourhood` switch defaulting off, and the one-line degrade notice. Round two fixed the fixture-shipped cache, per-section vectors with a model header, the adapter's home in the package and the two `CLERK_RETRIEVAL_*` variables, bounded reads and instance count, the `list_flagged` shape, the GLOSSARY term Rung, ADR-0002, and folding the README wording into the spec task.
4. Posted the resolution (sixteen numbered decisions plus facts) on the ticket, closed it, appended the gist to the map's Decisions-so-far, and cleared the README-and-Lint entry from the fog: the Lint half is decided and the README half is a spec line item. Added Rung to the GLOSSARY and wrote ADR-0002 for the cache placement.
5. Left inputs on the eval-story ticket (the slices now run off environment variables, and the typed result carries the Rung and whether the hop ran) and the spec task (the day-one Blob latency measurement and the README wording).

## Findings worth remembering

- The memo has to be held by the agent's config layer, keyed by namespace, because the store gives a fresh instance per call; the package never sees a namespace.
- Lazy delta embedding inside `search` keeps every write tool out of this effort; the only store change is one additive method plus one hidden prefix.
- The hidden prefix must stay excluded from `validatePage`'s folder table if a Page folder is ever added; ADR-0002 says so.
- `packages/wiki-links` is the browser's href helper, not the GLOSSARY's Link; left as is, noted for the spec.

## What the human checked

The human accepted every recommendation in both rounds and confirmed the shared-understanding summary before anything was written. The facts about the code and the research were gathered by the agent and not independently verified by the human in this session.

## Open questions

- The spec task still owns the day-one measurement of Blob `list` and `get` latency from the deployment region, which decides whether the 10-in-flight bound is generous or tight.
- The eval ticket decides whether `neighbourhood` ever defaults on.
- The branch for this session stacks on the two unpushed prototype commits from the previous session, which had no PR open; the previous session's uncommitted run entries were left untouched in the working tree.

## Artifacts

- Ticket: [The seam, its callers, and the degrade path](https://github.com/rymanacevedo/business-wiki-agent/issues/48) (closed, resolution comment)
- Map: [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42) (Decisions-so-far and fog updated)
- Files: `GLOSSARY.md` (Rung), `docs/adr/0002-retrieval-cache-hidden-prefix.md`
- Branch: `wayfinder/48-seam-and-callers`
