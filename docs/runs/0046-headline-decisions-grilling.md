# 0046: Which decisions headline the README

- **When**: 2026-10-23
- **Agent**: Claude Code, Opus 5.5
- **Driving**: [Which decisions headline the README](https://github.com/rymanacevedo/business-wiki-agent/issues/80), on the map [the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/76)

## Goal

Work the next frontier ticket on the submission-README map: choose the roughly 12 lines of decisions and trade-offs, and the model-table rows, that the README carries.

## What happened

- Claimed the ticket and read the inputs: the research notes from [Research: the decision and trade-off each run records](https://github.com/rymanacevedo/business-wiki-agent/issues/77) (13 ranked candidates, the model facts) and the "Decisions and trade-offs" section of the skeleton from [Prototype: the README skeleton at 200 lines](https://github.com/rymanacevedo/business-wiki-agent/issues/79).
- Found that the skeleton already states 8 of the 13 candidates somewhere else, including the top three. One grilling round of eight questions followed, and the Owner accepted every recommendation.
- Decided:
  - **No repeats.** A headline bullet carries only a decision that the README doesn't state anywhere else.
  - **The three bullets:** Eve with the Wiki in an app-runtime store (ADR 0001, which carries "Why Eve"); fixtures built by Clerk itself; shipping with the review findings listed after changing defaults.
  - **The model table:** five rows, with the Embeddings row reframed as keyword-only instead of hybrid. The skeleton had it backwards.
  - **Empty cells:** any cell no entry records says "not recorded" (the Owner chose (ii) over supplying the facts).
  - **Build's spend:** cited only once the two spend entries, 0031 and 0042 on the unpushed `wayfinder/49-eval-story`, are on `main` (renumbered).
- Posted the resolution on the ticket, closed it, added the line to the map's Decisions so far, and extended the fog item on uncommitted run entries.

## Findings worth remembering

- The skeleton's Embeddings row put the choice and the alternative the wrong way round. The spec should use the reframed row from the resolution.
- First written as 0043 on `prototype/79-readme-skeleton`, then landed on `main` as 0046 together with four earlier Codex review entries (renumbered from 0025, 0028, 0029, 0030 to 0042–0045). The `wayfinder/49-eval-story` entries 0031 and 0042 now need new numbers when they land.

## What the human checked

The Owner decided all eight questions, accepting each recommendation, and chose "not recorded" for the Build and Review cells rather than supplying an alternative or a cost.

## Open questions

None for this ticket. Whether the two spend entries reach `main` stays in the map's fog.

## Artifacts

- [Resolution comment](https://github.com/rymanacevedo/business-wiki-agent/issues/80#issuecomment-6377261080)
- [Map](https://github.com/rymanacevedo/business-wiki-agent/issues/76)
