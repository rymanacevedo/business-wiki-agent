# 0016: Synthesize the spec and implementation ticket graph

- **When**: 2026-10-18
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Task: synthesize the spec and implementation ticket graph](https://github.com/rymanacevedo/business-wiki-agent/issues/14)

## Goal

Work through the map: the last open ticket asked to synthesise every resolved decision into a `ready-for-agent` spec issue, break it into an implementation ticket graph with a three-day plan and explicit scope cuts, reserve the improve-loop tickets, link the spec from the map, and close the map.

## What happened

1. Loaded the map and queried the frontier: the synthesis task was the only open child and unblocked; claimed it.
2. Read the `to-spec` and `to-tickets` skills from disk (they are not model-invocable) and followed them by hand. Pulled the full bodies and resolution comments of all twelve closed tickets, the prototype's `SCHEMA.md`, the glossary, ADR 0001, the brief, the integration-review handoff, and the packages README.
3. Wrote [Spec: Clerk, the business wiki agent take-home submission](https://github.com/rymanacevedo/business-wiki-agent/issues/15): Problem, Solution, 47 user stories, Implementation Decisions grouped by area with each group linking the ticket that holds the detail, Testing Decisions, Out of Scope, and Further Notes carrying the day plan, the ordered scope cuts, early risks, and references to the research and prototype branches. The spec issue is the single canonical copy; nothing was duplicated into `docs/specs/`, and the Codex review wrapper takes the issue number via `--ticket`.
4. Chose two test seams and stated them in the spec rather than pausing to ask: the agent seam (Eve's eval harness through `t.send`, inspecting transcript, trajectory, and the session namespace in the local store) and the package seam (entry-point tests for the store, masking, the `update_page` guard, the Manifest validator, the reporter, diff, and calibration scripts).
5. Drafted fifteen tracer-bullet tickets, created them as sub-issues of the spec (#16 to #30), each with the `ready-for-agent` label, then wired GitHub native blocking edges in a second pass. Frontier at close: the store package and the Corpus tickets.
6. Updated the map: appended the task's gist and the spec link to Decisions so far, replaced the last fog entry (day plan and scope cuts) with a note that it is settled in the spec. Posted the resolution on the task ticket, closed it, and closed the map.

## Findings worth remembering

- The day-1 agent work split naturally into a store ticket (pure, unit-testable, no model) and an agent ticket (scaffold, read tools, Query), so the first frontier has two independent starts and the Corpus can be generated in parallel with both.
- The fixture build is Clerk's own Ingest output, so it cannot exist before Ingest works; that chain (Ingest, fixtures, harness) is the critical path and sits on day 1 and the start of day 2.
- Calibration labels are of the baseline's outputs, so the label dump belongs to the baseline ticket and the agreement script to the after ticket; the judge-disagreement narrated failure in triage may have to be provisional if the Owner has not labelled yet.
- `gh issue create --parent` was not used; `gh issue edit <spec> --add-sub-issue <n>` after creation worked on gh 2.97.

## What the human checked

Nothing yet: this session ran unattended. The `to-spec` and `to-tickets` skills normally pause for a seam check and a breakdown review; both were replaced by stated assumptions (listed in the resolution comment on the task ticket). The Owner should skim the ticket table there and edit any issue before starting `/implement-spec`.

## Open questions

- Whether the Owner wants the spec also committed under `docs/specs/` for offline reading; the issue is canonical and the review wrapper does not need a file.
- Whether fifteen tickets is the right granularity for the implementing agent's context budget; the Ingest ticket (#19) is the largest.

## Artifacts

- Spec: https://github.com/rymanacevedo/business-wiki-agent/issues/15
- Tickets: #16 to #30 (sub-issues of the spec)
- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/14 (closed); map https://github.com/rymanacevedo/business-wiki-agent/issues/1 (closed)
- This run file.
