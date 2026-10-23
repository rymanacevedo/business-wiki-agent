# 0029: Synthesise the retrieval spec and implementation ticket graph

- **When**: 2026-10-23
- **Agent**: Claude Code (Fable 5.1)
- **Driving**: [Task: synthesise the retrieval spec and implementation ticket graph](https://github.com/rymanacevedo/business-wiki-agent/issues/50) on [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42)

## Goal

Work the map's last ticket: turn the seven resolved decisions into one `ready-for-agent` spec issue plus a blocked ticket graph that `implement-spec` can run, with the day plan and the ordered scope cuts, then point the map at them and close it.

## What happened

1. Loaded the map; the frontier held one ticket, the spec task. Claimed it. Read the `to-spec`, `to-tickets` and `implement-spec` skills from disk (they are not model-invocable) and followed them by hand, as run 0016 did for the first spec.
2. Pulled the full resolutions of the Link model, the prototype, the seam and the eval story tickets, the recommendation sections of the three research notes on their branches, the prototype branch's file list, ADR-0002, the GLOSSARY, the store and backend interfaces, the current `search_wiki`, the agent config, the Lint skill, the Query eval and its cases schema, the diff script and reporter, the fixture builder, the README diagram and eval blocks, and Eve's docs for `toModelOutput` and the eval assertions. Checked every caller that lists the whole namespace (the Ingest check, `search_wiki`, eval seeding, the fixture builder) because the hidden `cache/` prefix must be invisible to each.
3. Wrote [Spec: Retrieval for Clerk, hybrid Matches and a Neighbourhood behind search_wiki](https://github.com/rymanacevedo/business-wiki-agent/issues/53): Problem, Solution, 32 user stories, Implementation Decisions grouped by area with each group linking the ticket that holds the detail, Testing Decisions naming one new seam and three existing ones, Out of Scope, and Further Notes with the two-day plan, scope cuts in order (embeddings first), early risks and references. The issue is canonical; nothing went under `docs/specs/`.
4. Drafted ten tracer-bullet tickets in the order the eval ticket fixed, created them as sub-issues of the spec with `ready-for-agent`, then wired native blocking edges in a second pass. Frontier at close: the rows-and-baseline ticket alone, because the eval ticket said no module code lands before the baseline tag.
5. Posted the resolution on the task ticket with the seven assumptions that replaced the skills' two pauses (seam check, breakdown review), closed it, appended the gist to the map's Decisions-so-far, replaced the fog placeholder, and closed the map.

## Findings worth remembering

- No committed eval run has ever called `search_wiki`; the spec frames the eval story as a measurement and the README must say which of the eight new rows the baseline already passes. The rows ticket's run log records that.
- Eve 0.80.1 exposes `turn.toolCalls` on eval turns and `toModelOutput` projects only what the model sees, so a tool can carry a structured result to the evals while the model reads Markdown. Whether `toolCalls` carries the full `execute` output or the projection is the first risk to check; the metrics ticket names `eventsSatisfy` as the fallback.
- The fixture builder re-runs the agent over the whole Corpus, so the fixture embed step must run on its own over the existing fixture directories, or the frozen rows would see changed Pages.
- The `readWikiDir` reader the evals and checks use would count `cache/embeddings.json` as a Page unless it skips the prefix; the store ticket carries that criterion alongside the store's own hiding rule.
- Working tree state at the start: run entries 0022 (modified), 0025 and 0028 (untracked) belong to other sessions and were left alone; branch `wayfinder/49-eval-story` holds run 0027 unmerged with no open PR. This entry was committed from a fresh branch off `main`.

## What the human checked

Nothing yet: the session ran unattended. The seam check and the breakdown review the skills call for were replaced by stated assumptions, listed in the resolution comment on the task ticket. The Owner should skim the ticket table there and edit any issue before starting `/implement-spec`.

## Open questions

- Whether ten tickets is the right grain for the implementing agent; the package ticket is the largest and could split into sections-and-ranking versus tool-and-rendering if it overruns one context window.
- Whether the Owner wants the rows ticket to block the store ticket (chosen, for a clean "no module code before the baseline" history) or would rather run them in parallel and accept the tag landing after the manifest.
- The branch `wayfinder/49-eval-story` (run 0027) still needs a PR to land on `main`.

## Artifacts

- Spec: https://github.com/rymanacevedo/business-wiki-agent/issues/53
- Tickets: #54 to #63 (sub-issues of the spec, native blocking edges)
- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/50 (closed); map https://github.com/rymanacevedo/business-wiki-agent/issues/42 (closed)
- Branch: `wayfinder/50-retrieval-spec` (this run file only)
