# 0035: eval-diff --block and the By tag table

- **When**: 2026-10-23
- **Agent**: Claude Code (Opus 5.5), implementer for one ticket under the spec orchestrator
- **Driving**: [eval-diff --block and the By tag table](https://github.com/rymanacevedo/business-wiki-agent/issues/62), spec [#53](https://github.com/rymanacevedo/business-wiki-agent/issues/53); decision [#49](https://github.com/rymanacevedo/business-wiki-agent/issues/49) item 12

## Goal

The diff script should write a second README block and group rows by tag, so the after ticket (#63) only has to run it.

## What happened

Built test-first at the two seams the spec names: the `eval-report` diff entry point and the script.

1. `rewriteReadmeBlock(readme, block, name?)` takes the default `eval-diff` pair, or `eval-diff:<name>:start/end` when given a name. When the pair is missing it throws and names that pair.
2. The before/after page gained a "By tag" section after "By class": cases and pass rate before and after, one row per tag, with every tag counted. The README table and the existing sections are unchanged. One test self-diffs the committed `retrieval-before` run. Its expected `retrieval` (7/8) and `retrieval:*` rows were counted by hand from `query.json`.
3. `scripts/eval-diff.ts --block <name>` writes the named pair. The name must be a lowercase slug (exit 64 otherwise).
4. Found in a dry self-diff on the real README: the five #28 dataset fixes in `dataset-fixes.json` showed up on the retrieval block, with a "5 rows changed what they expect" note. That note is false for retrieval-before → retrieval-after. A named block now reads `dataset-fixes.<name>.json` instead, and that file is absent for `retrieval`. A script test covers it.
5. The README's evals section now has the empty `eval-diff:retrieval` pair and a line naming the command that fills it. I regenerated `docs/evals/before-after.md` with `before after`; the only diff is the new By tag section.

## Findings worth remembering

- The script always rewrites `docs/evals/before-after.md` for whatever pair it is given. #63's `retrieval-before retrieval-after --block retrieval` replaces the `before → after` page with the retrieval pair. #63's AC expects this ("writes ... the before/after page's 'By tag' table"), but the README's link to the page will then describe the retrieval runs.
- The shell's `cp` is aliased to `cp -i`. Use `\cp -f` when restoring files in scripts.

## What the human checked

Nothing yet. The PR is a draft until the Codex gate passes.

## Open questions

- Should the README block for `retrieval` hold the By tag rows as well as the slice table? Right now it holds the slice table only, as the spec words it.

## Artifacts

- PR #68 (draft, stacked on #54), branch `ticket/62-eval-diff-block`
- `packages/eval-report/lib/diff.ts`, `scripts/eval-diff.ts`, their tests
