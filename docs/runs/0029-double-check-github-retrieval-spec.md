# 0029: Double-check the GitHub retrieval spec

- **When**: 2026-10-23
- **Agent**: Codex (GPT-6)
- **Driving**: human-requested review of [Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

## Goal

Read the GitHub issues and stress-test the spec directly, without invoking the grilling skill.

## What happened

Read task 50, spec 53 and its comments, and open issue list. The first native sub-issue check caught graph creation in progress. After the human prompted a recheck, confirmed all ten native sub-issues (54–63), read their bodies and blocking edges, and confirmed tasks 50 and map 42 are closed. Compared commitments with the eval-story resolution and local fixture. No GitHub writes or implementation changes.

## Findings worth remembering

The testing paragraph requires cited Pages for all eight rows in lexical-only and hybrid modes, conflicting with absent rows and the semantic experiment. The Lint scope cut knowingly permits incomplete scans. Bench timing differs between the handoff and day plan. MRR needs explicit handling of multiple/alternative citations, absent rows and missing results before it selects defaults. Prebuilt Page vectors do not remove the query embedding network call. The zero-term-overlap claim remains false for the vehicle/service prompt. Aggregate pass counts can retain embeddings while individual retrieval rows regress; a tie can retain embeddings without demonstrated gain.

## What the human checked

The human clarified that they wanted the GitHub spec checked rather than only the latest run-log diff. No response to these findings yet.

## Open questions

Which clarifications to adopt before implementation. Child tickets narrow package result assertions appropriately, but parent spec still contradicts them. Ticket 61 leaves metric treatment ambiguous for absent rows and never-search rows, and should define hop-only across all searches. Ticket 58's zero-embed warm-cache test must exclude the required query embedding. The native dependency graph exists; the earlier missing-graph finding is withdrawn.

## Artifacts

- [Spec 53](https://github.com/rymanacevedo/business-wiki-agent/issues/53).
- [Synthesis task 50](https://github.com/rymanacevedo/business-wiki-agent/issues/50).
- Snapshot read locally at `/tmp/review-53.json`.
- Other sessions' uncommitted run entries left untouched.
