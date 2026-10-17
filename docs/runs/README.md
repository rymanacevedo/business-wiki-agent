# Run log

One file per agent session, so the human can retell the thought process behind every turn of the build and answer "how did the coding assistant help, and what did you check yourself" at the interview.

## When to write one

End every agent session by adding a run file, before reporting back. Codex and Claude Code sessions both count. A session that produced only a conversation still gets an entry: the decisions are the record.

## File

`docs/runs/NNNN-<slug>.md`, numbered from `0001` in the order the sessions started. Take the next free number; if two sessions collide, the later one renumbers.

## Template

```markdown
# NNNN: <what this run was for>

- **When**: <date>
- **Agent**: <Claude Code / Codex, model if known>
- **Driving**: <ticket or map link, or "ad hoc: <request>">

## Goal

<one or two lines: what the human asked for>

## What happened

<the decisions made and work done, in order, each with the reason. Link tickets by title.>

## Findings worth remembering

<facts surfaced that later runs depend on; gotchas; things that surprised us>

## What the human checked

<what the human verified or decided themselves, versus accepted from the agent>

## Open questions

<what this run left undecided or unverified>

## Artifacts

<links: commits, branches, issues, files>
```

Write for a reader who did not see the session: name things by title, give the reason beside each decision, and keep it to one screen where possible. Facts already on the wayfinder map or in a ticket get a link, not a restatement.
