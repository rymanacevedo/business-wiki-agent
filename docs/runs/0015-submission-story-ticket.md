# 0015: Resolve the submission story ticket

- **When**: 2026-10-18
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Submission story: README, diagram, before/after, production eval plan](https://github.com/rymanacevedo/business-wiki-agent/issues/13)

## Goal

Work through the map: take the next frontier ticket and resolve it. The ticket asked what the 30-minute Reviewer path is and which artifacts the spec must require: README structure, diagram, before/after presentation, production evaluation plan, and the split between generated, hand-written, and recording-only material.

## What happened

1. Queried the frontier: the submission-story ticket was the only unblocked child (the spec-synthesis task is blocked on it); claimed it.
2. Gathered facts before asking: the brief's "what to send us" list, the eval-design resolution and the context comment it had left on this ticket, the persistence resolution's demo and surface decisions, and the LangSmith research's share-link and retention facts.
3. Round 1, fifteen questions covering the whole frontier: README as the full story with a timed six-stop box, one Mermaid flowchart, the diff script owning a marked README block, three narrated failures by a selection rule, a dedicated LangSmith evals project, share links plus invite for trace access, account-free committed results, the datasets page, the five-part production plan, the two limitation lists, the disclosure pointing at the run log, the generated / agent-written / human-edited split, the two-tier quickstart, optional screenshots, and the Reviewer glossary term. All accepted.
4. Round 2, three leaves: a two-sentence "Why Eve" note, a submission-day checklist file, and an agent-drafted pitch sentence. All accepted.
5. Added Reviewer to the glossary, posted the resolution, closed the ticket, appended the gist to the map, removed the production-plan fog entry (decided here, graduates into the spec), and left a context comment on the spec-synthesis task naming the remaining fog (day plan and scope cuts) as its to settle.

## Findings worth remembering

- LangSmith public share links expire with the Developer plan's 14-day retention, so the README dates them and they are created on submission day, not during the build.
- Eval traces from the laptop would otherwise land in the `local` project; a dedicated `business-wiki-agent-evals` project with run-label and case-id attributes keeps before and after filterable, with two projects as the fallback.
- "Evaluator" is now reserved for the eval meaning; the person reading the submission is the Reviewer.
- The spec-synthesis task is now the only open ticket and is unblocked.

## What the human checked

- Accepted all eighteen recommendations across both rounds without changes.

## Open questions

- Whether the OTel exporter lets a single eval run set per-run span attributes; the fallback is decided but untested.
- The exact alert thresholds in the production plan are left to the page's author; the structure is fixed.

## Artifacts

- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/13#issuecomment-6245955370
- Context comment on the spec-synthesis task: https://github.com/rymanacevedo/business-wiki-agent/issues/14#issuecomment-6245955697
- `GLOSSARY.md` (Reviewer added), this run file.
