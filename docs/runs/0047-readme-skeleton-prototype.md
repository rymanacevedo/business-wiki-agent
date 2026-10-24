# 0043: Prototype the submission README skeleton

- **When**: 2026-10-23
- **Agent**: Claude Code, Claude Opus 5.5
- **Driving**: [Prototype: the README skeleton at 200 lines](https://github.com/rymanacevedo/business-wiki-agent/issues/79), on the map [Wayfinder map: the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/76)

## Goal

Work the map's next frontier ticket: show the Owner what the README looks like as the submission (pitch, 8-row table, sections with line budgets, and a fate for every current section) so they can react.

## What happened

- Took the prototype ticket, because the other frontier ticket ([Task: confirm the narrated failures against their traces](https://github.com/rymanacevedo/business-wiki-agent/issues/78)) was already claimed.
- Checked which README content already lives under `docs/`, by searching for each section's distinctive phrases. Most of it does: the narrated failures in full, the retrieval rules and their outcome, the trace filter and the production plan. These are deleted from the README. Three things exist nowhere else, so they move: the 8-row retrieval table and the variant runs, the eval limitations, and the integration-review rounds 2–6 with the `after-repairs` run.
- Wrote `README.prototype.md` on a throwaway branch. It drafts each section at about its real length, so the line count is honest, and ends with a disposition table.
- Measured the draft: about 225 rendered lines against a target of about 200. I listed the cuts by size rather than trimming quietly.
- The Owner chose A1, kept the small-limits line, and took cuts a, b, d and e (see the ticket's resolution comment). I closed the ticket and added the decision to the map.

## Findings worth remembering

- `bun run eval:diff` writes the docs page first, then exits 1 if the README lacks its marker blocks. The "one before/after table" decision therefore has to keep the markers; A1 folds them into `<details>`.
- `0042` is used on the unpushed `wayfinder/49-eval-story` branch, so this entry took `0043` to avoid a known collision.

## What the human checked

The Owner picked every choice: A1 (keep the generated tables, folded), keeping the small-limits line, and cuts a, b, d and e. I accepted their shape and budgets from the skeleton.

## Open questions

- These were not answered, so the drafted shape stands: the Quickstart sits before the diagram, and the before/after table keeps two rows (`after-repairs` gets a pointer only).
- The second narrated failure waits on the failure-confirmation task.

## Artifacts

- Branch `prototype/79-readme-skeleton` (commit 718192a, never merged): `README.prototype.md`
- [Prototype: the README skeleton at 200 lines](https://github.com/rymanacevedo/business-wiki-agent/issues/79), resolution comment and closed
