# 0020: Commit the README handoff

- **When**: 2026-10-19
- **Agent**: Codex
- **Driving**: ad hoc: commit pending work and assess the suspected judge error

## Goal

Commit dangling changes and determine what the checkout can establish about
the reported prompt-injection faithfulness score.

## What happened

Reviewed the pending README diff and both untracked run entries. Included
the earlier session's unchanged 0017 entry under the user's explicit request
to commit pending work. Inspected the chat judge: boolean probabilities
come directly from the model's structured response.

## Findings worth remembering

This checkout has no `docs/evals/runs` artifacts. The specific zero score
cannot be verified without the source, generated summary, rubric, and
actual judge input/output. Treat it as a suspected judge disagreement,
not a confirmed false negative or an agent failure.

## What the human checked

The human reported that the summary looks faithful and authorized committing
pending work. No additional eval evidence was supplied in this session.

## Open questions

Confirm the suspected disagreement during triage #27 using the live run
artifacts. Run numbering uses the local tree and cached origin/main because
the prior fetch attempt could not write read-only `.git/FETCH_HEAD`.

## Artifacts

- [README](../../README.md)
- [Judge implementation](../../packages/chat-judge/lib/judge.ts)
