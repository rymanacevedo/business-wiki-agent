# 0022: Architecture review, then chart the retrieval map

- **When**: 2026-10-20, evening
- **Agent**: Claude Code (Claude Fable 5.1)
- **Driving**: `/improve-codebase-architecture` against the llm-wiki-workshop repo and `instructions.md`, then `/wayfinder` on its first candidate

## Goal

Review Clerk against the decodingai llm-wiki-workshop and its principles, find what document Ingest could adopt, answer whether the brief's "retrieval step (RAG)" is implemented, and then chart a wayfinder map for the top candidate.

## What happened

1. **Two subagents in parallel**: one read the workshop repo end to end (every skill file, script and example wiki), the other walked Clerk's Ingest and Query paths, the packages, the evals and the known failures. Reason: the review needed both sides before any card could be written.
2. **Answered the RAG question**: not implemented. Query is Index-first `read_page` plus `search_wiki`, a substring scan of every Page with no ranking, no section excerpts, and SCHEMA, Index and Log competing with real Pages. The workshop has no vector store either; its leverage is ingest discipline (source adapters with receipts, identity as the raw key, a generated index, a fixed ingest tail, each raw file read once).
3. **Wrote the review** as a self-contained HTML report with eight candidates (`/tmp/architecture-review-20261020-232858.html`, copied to `~/Documents/architecture-review-clerk-20261020.html`): deepen Query retrieval; a Source intake seam for uploads (contradicts the last consequence of ADR-0001, flagged); the Index as a derived cache; deterministic Lint behind `wiki-check`; collapse the Ingest tail; Masking at the write seam; one turn-state module; and the workshop ideas not adopted (query save-back, the mention threshold). Top recommendation: retrieval, then the Index as cache.
4. **Charted the map for candidate 1**. Round one named the destination; the human answered Q2 with Paul Iusztin's "Agentic GraphRAG" article, which changed the design from lexical-first to hybrid entry (keyword plus embedding, fused by Reciprocal Rank Fusion) followed by expansion along the Wiki's own Links. Round two established that the Wiki already is a typed graph (481 Citations, 134 Page links, 74 `sources:` lists, 18 vendor fields in `fixtures/full`) so Ingest is the extraction step and no model-extracted ontology or graph database is needed. Round three fixed the ticket set, a one-to-two-day build budget with embeddings as the first scope cut, and the out-of-scope list.
5. **Added two GLOSSARY terms**, Link and Neighbourhood, and removed "link" from Citation's avoid list, because the article's "graph", "memory", "node" and "edge" vocabulary collides with the GLOSSARY and with Eve's memory slots.
6. **Created the map** ([Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42)) with eight child tickets wired with native blocking: three research tickets (Gateway embeddings, cache placement, lexical ranking and rank fusion), three grilling tickets (the Link model and interface; the seam, callers and degrade path; the eval story), one prototype (the result as the model sees it), and the closing synthesis task.
7. **Fired three research subagents** in isolated worktrees, one per research ticket, each writing to a `research/<name>` branch, commenting on and closing its ticket.

## Findings worth remembering

- The original map (issue #1) chose "an index-first retrieval step" deliberately and recorded no embeddings; this map revisits that with the brief's RAG line as the reason.
- The workshop's single highest-leverage rule for Clerk is "frontmatter is canonical, the index is a rebuildable cache"; the Obligation Index-line prefix is currently encoded in seven places.
- Eve stages message attachments in the sandbox, which Clerk does not use (`defaultTools: false`); an upload path must come through a channel route and the privileged seed writer, which is why the intake candidate asks to reopen ADR-0001 rather than contradict its reasoning.
- The eval judge selects Pages by `cites` patterns and answer links, so it must stay independent of retrieval.

## What the human checked

The human chose the destination shape (spec plus ticket graph), redirected the retrieval design to the GraphRAG article, and confirmed every recommendation in three rounds. The agent chose the candidate list, the ticket breakdown and the blocking graph.

## Open questions

- Whether the Gateway offers an embedding model and whether the Blob cap allows a cached index: both open until the research lands; the map records the lexical-only degrade path as the fallback.
- Whether a long Index should ever be skipped on a Query stays in the map's fog.
- The GLOSSARY change and this run entry are uncommitted on `main` at the end of the session.

## Artifacts

- Map issue #42, tickets #43 to #50.
- Research branches (pushed by subagents): `research/gateway-embeddings`, `research/retrieval-cache`, `research/lexical-ranking`.
- Review report: `~/Documents/architecture-review-clerk-20261020.html`.
- `GLOSSARY.md`: Link, Neighbourhood.
