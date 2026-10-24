# 0055: Submission day, the agent's steps of the checklist

- **When**: 2026-10-23
- **Agent**: Claude Code, Opus 5.5
- **Driving**: [the submission checklist](../submission-checklist.md), after PR #97 merged

## Goal

The Owner asked the agent to run `docs/submission-checklist.md`. The agent took the steps that need only the API and the CLI. It left the recording, and every step that depends on it, to the Owner.

## What happened

- **Step 1, retention ([#88](https://github.com/rymanacevedo/business-wiki-agent/issues/88)):** one feedback item, key `submission_narrated_failure`, was posted through the API to each of the three root runs with `extend_trace_retention=true`. The tier upgrade is asynchronous: the three runs read `shortlived` for about two minutes, then all read `longlived`. The free tier accepted it, so the fallback wasn't needed.
- **Step 2:** `demo` was reseeded from `fixtures/full` (73 Pages, 34 Sources). The deployed `/` and `/wiki` answer 200.
- **Step 5:** `PUT /api/v1/runs/{id}/share` made public links for the deny, Eastside and ingest-everything traces. Each one opens without an API key. They fill `[trace-deny]:`, `[trace-eastside]:` and `[trace-all]:`, and the Traces section's "generated on" date is 2026-10-23.
- Three placeholders are left: the Recording row, `[trace-happy]:` and What I checked myself.

## Findings worth remembering

- The Eastside run started 2026-10-23, not 2026-10-19 like the two before traces. Its base retention would have run out later, but it is extended now too.
- `trace_tier` can take a few minutes to change after the feedback is posted. Poll it rather than reading it once.

## What the human checked

Nothing yet. The Owner records the capture (step 3), shares its trace (step 4), reseeds `demo` again (step 6), edits What I checked myself (step 7), flips the repository public (step 9) and sends the links (step 10).

## Open questions

- None new.

## Artifacts

- Branch `docs/submission-day-links`. Share links are in `README.md` under Traces.
