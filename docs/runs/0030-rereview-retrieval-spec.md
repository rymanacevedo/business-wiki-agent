# 0030: Re-review the updated retrieval spec and tickets

- **When**: 2026-10-23
- **Agent**: Codex (GPT-6)
- **Driving**: human-requested re-review of [Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

## Goal

Check the updated specification and all ten child tickets against the prior findings.

## What happened

Read current issue bodies and comments for 53–63 through GitHub. Verified the earlier corrections to testing, cache terminology, metrics, scoring, semantic wording, scope cuts and embedding retention. The spec records Owner acceptance of its decision amendments. Fetched main before numbering this entry. No GitHub writes or implementation changes.

## Findings worth remembering

Two remaining contract gaps: `flagged` must initialise and refresh the memo independently of `search`, and hop promotion must be measured with the embedding setting that actually ships if embeddings are cut. A smaller bench concern: independently selected knob improvements need a combined-configuration result because their effects can interact.

## What the human checked

The human requested another review; the agent checked current issue content. No acceptance of the new findings yet.

## Open questions

Add cold/stale `flagged` tests to ticket 59 and specify hop comparison against the selected text ranker in ticket 63. Record the combined bench configuration before agent runs.

## Artifacts

- [Spec](https://github.com/rymanacevedo/business-wiki-agent/issues/53), tickets 54–63.
- Read snapshots: `/tmp/rereview-53.json` through `/tmp/rereview-63.json`.
- Other sessions' edits and earlier review logs left untouched.
