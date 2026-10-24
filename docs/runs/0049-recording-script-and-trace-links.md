# 0049: The recording script and the trace-link set

- **When**: 2026-10-23
- **Agent**: Claude Code, Opus 5.5
- **Driving**: [The recording script and the trace-link set](https://github.com/rymanacevedo/business-wiki-agent/issues/81), on the map [the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/76)

## Goal

Work the next frontier ticket on the submission-README map. It was the only open, unblocked ticket. It was a grilling ticket: what the recording shows, which four traces get public links, and the submission-day steps.

## What happened

- The agent claimed the ticket and grilled the Owner in three rounds. The Owner accepted every recommendation. The full answer is in the [resolution comment](https://github.com/rymanacevedo/business-wiki-agent/issues/81#issuecomment-6377621648).
- **Recording:** about 2:30 of voice-over, posted as an unlisted YouTube video, made from the merged README. It runs Inbox, then Approve on the renewal card (Deny is already a narrated failure), then that turn's production trace, then the before/after table.
- **Links:** one trace per narrated failure, because four links can't hold a before-and-after pair for each:
  - the recording's own trace as the happy path
  - the deny before trace
  - the `query-van-repair-bill` retrieval trace, where the Owner is told "$298"
  - the ingest-everything before trace
- **Retention:** a research subagent found that an expired trace is deleted along with its share link, so making links early doesn't help. Feedback sent through the API with `extend_trace_retention=true` extends a trace to 180 days. The extension was filed as its own issue with a 2026-11-01 deadline, with a fallback to the after traces.
- **Submission-day steps:** the README ships `<!-- submission-day -->` placeholders, cleared by a final grep. The spec rewrites `docs/submission-checklist.md` in place.

## Findings worth remembering

- LangSmith extended retention on SaaS is now **180 days, not 400** (changed 2026-09-14, new traces only). Feedback added in the UI no longer extends retention; only the API flag does.
- The workspace is on the free tier (`free_10_2026`), and every trace checked is `shortlived`. Whether the free tier allows an upgrade, and what it costs, is unconfirmed.
- The screenshots step on the checklist is already done: both PNGs exist and the README links them.

## What the human checked

The Owner made every decision above: the beats, the host, the link set, the extension and its fallback, the placeholders, and the checklist order. The agent supplied the retention facts.

## Open questions

- Whether the free tier accepts `extend_trace_retention=true`, which [Extend retention on the three narrated-failure traces by 2026-11-01](https://github.com/rymanacevedo/business-wiki-agent/issues/88) answers.
- The retrieval trace's full id isn't in the repo. The issue gives its suffix and how to find it.

## Artifacts

- [The recording script and the trace-link set](https://github.com/rymanacevedo/business-wiki-agent/issues/81) (closed), with its resolution comment.
- [Extend retention on the three narrated-failure traces by 2026-11-01](https://github.com/rymanacevedo/business-wiki-agent/issues/88) (new, `ready-for-human`).
- The map's Decisions so far, which gained one line.
