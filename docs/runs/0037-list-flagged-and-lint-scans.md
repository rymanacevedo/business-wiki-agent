# 0037: list_flagged tool and the Lint skill's exhaustive flag scans

- **When**: 2026-10-23
- **Agent**: Claude Code (Opus 5.5), implementer subagent
- **Driving**: [list_flagged tool and the Lint skill's exhaustive flag scans](https://github.com/rymanacevedo/business-wiki-agent/issues/59), part of [Spec: Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

## Goal

Move Lint's flag scans from `search_wiki`, which is ranked and capped at five, to an exhaustive read-only `list_flagged(flag)` built on the retrieval instance's `flagged`.

## What happened

- `flagged` already validated the memo, through `memo.refresh()` (one `manifest("")` plus the delta). I left it alone, because #56's repair owned its parsing. I added one package test that pins the remaining acceptance criteria: a cold instance answers `flagged` with no search before it, and a flag removed through the store between two calls is gone on the second call. The test was green on its first run, since the behaviour had shipped in #56.
- Tool, test first: `agent/lib/tests/list-flagged.test.ts` was red because the module was missing. It covers the line format, the empty message, six flagged Pages listed past five and sorted by path, the closed enum, and the tool's absence from `WRITE_TOOLS`. Then `agent/tools/list_flagged.ts`, whose enum is a new `FLAGS` constant in the package entry point, so `Flag` derives from one list.
- The Lint skill's steps 2 and 3 call `list_flagged` and then `read_page` ("every Page listed"). Step 5 names `list_flagged` beside `search_wiki`. Nothing else in the skill changed.
- In the README, `list_flagged` joined the diagram's Read tools box, and the `tools/` count went from ten to eleven.
- Live check, limited to 3 rows because the Gateway is shared: `lint/checks/0000`, `0003` and `0004` passed with the `full` seed. The local traces show the model calling `list_flagged` with `conflict`, `suspicious-content` and, on the "Are any Pages flagged?" row, `needs-owner`. The run artifact was not committed.
- I merged #56's YAML repair (393ff55). Its conflict with my test in `flagged.test.ts` was resolved by keeping both sides.

## Findings worth remembering

- The full 5-row Lint slice did not run here. #63 runs it.
- Unprompted, the model also scans `needs-owner` when asked for flagged Pages, since the enum offers it.

## What the human checked

Nothing yet. The PR is a draft.

## Open questions

None.

## Artifacts

- PR #70 (draft, base `ticket/56-wiki-retrieval-lexical`), branch `ticket/59-list-flagged`
- `agent/tools/list_flagged.ts`, `agent/skills/lint.ts`, `agent/lib/tests/list-flagged.test.ts`, `packages/wiki-retrieval/index.ts`, `packages/wiki-retrieval/tests/flagged.test.ts`
