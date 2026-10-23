# 0036: Query eval Rung metrics and the one instruction sentence

- **When**: 2026-10-23
- **Agent**: Claude Code (Claude Opus 5.5), implementer under the spec #53 orchestrator
- **Driving**: [Query eval Rung metrics and the one instruction sentence](https://github.com/rymanacevedo/business-wiki-agent/issues/61), PR #69, stacked on #67 (#56) and #65 (#54 + #55)

## Goal

Make the Query eval record what retrieval did on each row, and land the one Query instruction sentence the after runs share (decision #49 items 4, 5 and 8).

## What happened

- Built test-first: `retrievalMetrics(cites, toolCalls)` in `packages/answer-checks`.
  - It lives next to `judgedPages` because it applies the same `cites` semantics: every top-level entry is required, a nested list is any-of, and entries match result paths by substring, so a Source id matches its summary Page.
  - It reads only the structured `search_wiki` outputs, never the rendered text.
  - `searched` counts any `search_wiki` call, including one that never resolved.
- `scoreRetrieval` in `evals/lib/answers.ts` records the five metrics as labelled soft scores with no threshold. The Query eval calls it after the gates. Absent rows (no `cites`) record only the three Rung metrics.
- Outputs come from `turn.toolCalls[].output`, which is the full `execute` object. #56 confirmed this live. Eve 0.80.1 also derives each turn's `toolCalls` from that turn's own events, so no `eventsSatisfy` fallback was needed.
- Instruction step 2 and the `search_wiki` description now carry the decided sentence. The fixtures' `SCHEMA.md` still says "only when". It was left alone because it is Wiki data, not instructions, and changing it would also move the seeded fixtures.
- Live check, `WIKI_SEED=full` rows 0017, 0018 and 0023 (3 rows): the metrics appear per case and in the labelled-scores summary.
  - 0018 (Okafor): searched, expected Page in the result.
  - 0023 (absent): searched; no `expected_*` recorded.
  - 0017 (cash): Clerk never searched. It opened 12 receipts from the Index and quoted Dockside's 20.00 cash tendered, not the 15.61 total, so it failed its gates.
- Codex review (`--ticket 61 --ticket 53`):
  - First run, exit 2 (incomplete), but with a real blocker: searches before a session-limit continuation were lost. `drive` returns only the last segment. Repaired test-first: `driveSegments` returns every segment.
  - Rerun, exit 2: the reviewer could not run the full check read-only.
  - Next run (base had moved to #56's round-4 commit, merged), exit 1: earlier prompts of a multi-turn row contaminated the metrics. Repaired: score the last prompt's segments only, the same scope as the gates.
  - Exit 2 again for evidence only. Posted the check output and live evidence on #61. The rerun passed with exit 0.

## Findings worth remembering

- A continuation (a session-limit answer or a rate-limit retry) is a separate eve turn. Any per-turn fact collected through `drive` alone misses the earlier segments; use `driveSegments`.
- The new sentence did not make Clerk search on the cash row in one run. That is the kind of result the four labelled runs (#63) measure.
- The Dockside 20.00 vs 15.61 confusion also happens from `read_page`, not only from #56's excerpt padding.

## What the human checked

Nothing yet. The PR is a draft.

## Open questions

- Whether `SCHEMA.md`'s "only when" line should follow the instruction sentence. Changing it is a fixture change, so it is outside this ticket.

## Artifacts

- PR #69, branch `ticket/61-query-rung-metrics`
- `packages/answer-checks/lib/retrieval.ts`, `evals/lib/answers.ts`, `evals/lib/drive.ts`, `evals/query/questions.eval.ts`, `agent/instructions.ts`, `agent/tools/search_wiki.ts`
