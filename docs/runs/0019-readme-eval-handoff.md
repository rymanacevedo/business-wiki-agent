# 0019: README eval handoff

- **When**: 2026-10-19
- **Agent**: Codex
- **Driving**: Live Ingest report; README ticket #30

## Goal

Address the two README follow-ups from the reported Live Ingest run.

## What happened

Added the exact eval-diff start/end markers and the comparison command to
the README. Clarified that boolean judge probabilities are model-reported,
consistent with the chat judge implementation. Verified the real
`rewriteReadmeBlock` function replaces the new block and preserves the
following limitations section.

## Findings worth remembering

The human reported 24 passing, 2 failing, and 4 scored-only cases, with
128/131 gates passed, extraction 93%, page faithfulness 97%, $0.53 cost,
and 8m19s duration. Ridgeline's category and Freshway's known Trap defect
were the failures; the injection summary judgment remains a candidate
judge disagreement for triage #27. These results were not rerun here.

## What the human checked

The human supplied the Live Ingest results and identified the possible
judge disagreement. This session checked only the README integration.

## Open questions

The rebuild comparison and triage remain pending. Fetching origin failed
because `.git/FETCH_HEAD` is read-only; numbering uses the working tree
and locally available origin/main, whose highest entries are 0018 and
0016 respectively. No existing run entries were modified.

## Artifacts

- [README](../../README.md)
