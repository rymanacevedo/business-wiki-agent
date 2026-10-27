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
- Three placeholders were left: the Recording row, `[trace-happy]:` and What I checked myself.
- **2026-10-27, the Approval bug:** every approved `change_fact` on the deployed demo had failed with `WikiConflictError`. That was five attempts across the invoice and insurance-renewal turns, including the Owner's recording session. The deployment dated from about 10-21. For a body of about 1 KB or more, Blob's `get` returns a weak etag (`W/"…"`), and that build passed it to `put` as `ifMatch`, which Blob always rejects. A scratch-namespace test reproduced it: `BlobPreconditionFailedError` with the weak etag, success with the strong one. ca26afd had fixed this on 10-23, but it was never deployed. The Owner ran `eve deploy` from a clean worktree of `origin/main`.
- After the deploy, one Ingest-then-Approve turn ("Ingest the renewed insurance certificate.") ran end to end. The 2026-11-15 Obligation became `superseded`, the 2027-11-15 one was created, the Profile shows GL-2026-80233, and the log has the APPROVAL and INGEST lines. That trace, `…cb7a-bdb96291e345`, is shared as `[trace-happy]:` and its retention is extended. The Recording row reads "Sent with the submission email". `demo` was reseeded for the Reviewer.

## Findings worth remembering

- A store fix only reaches the demo with a deploy. `eve deploy` after any `packages/wiki-store` change, and run one approved write against production before recording.

- The Eastside run started 2026-10-23, not 2026-10-19 like the two before traces. Its base retention would have run out later, but it is extended now too.
- `trace_tier` can take a few minutes to change after the feedback is posted. Poll it rather than reading it once.

## What the human checked

Nothing yet. The Owner records the capture (step 3), shares its trace (step 4), reseeds `demo` again (step 6), edits What I checked myself (step 7), flips the repository public (step 9) and sends the links (step 10).

## Open questions

- None new.

## Artifacts

- Branch `docs/submission-day-links`. Share links are in `README.md` under Traces.
