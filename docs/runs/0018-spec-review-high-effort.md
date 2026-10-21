# 0018: Run the spec review at high reasoning effort with short errors

- **When**: 2026-10-18
- **Agent**: Claude Code (Opus 5.5)
- **Driving**: ad hoc: port commit c5ce6b4 from the reference copy of this tooling, relayed from another session

## Goal

Make `bun run review:spec` run Codex at high reasoning effort, and report a failed run by its `ERROR:` lines only, as commit c5ce6b4 did in the reference copy.

## What happened

Wrote the tests first:

- The fake `codex` in `scripts/tests/review-spec.test.ts` now exits 9 unless it receives `model_reasoning_effort="high"`.
- When `REVIEW_EXIT` isn't `0`, the fake writes noisy stderr containing two `ERROR:` lines. The fixture always sets `REVIEW_EXIT`, so the check is `!== '0'`, not a truthiness check.
- A new test asserts that a failed run's `error` field holds only those two lines.

Ten tests failed with exit 9, as expected.

Then changed the script and its docs:

- `scripts/review-spec.ts` passes `-c model_reasoning_effort="high"` to `codex exec` and filters stderr through `errorLines`. Codex echoes the prompt and progress on stderr, which used to fill the `error` field. The filter splits on `\r?\n`.
- `docs/agents/integration-review.md` now states both behaviours, so the doc matches the script.

Committed on the integration branch `spec/15-clerk`, because the final review for spec #15 runs there. An earlier attempt to commit straight from the relayed instructions was blocked by the permission check. The human then approved the commit.

## Findings worth remembering

The relayed report says the high-effort re-reviews in the reference repo passed with no findings on three commits: the effort fix, the blame-ignore commit, and the toolchain switch. That reviewer checked the Node version logic statically; it did not run the build, tests, lint, or hook.

The untracked `docs/runs/0017-verify-live-adversarial-review.md` belongs to a concurrent Codex session and was left alone. It notes that the body of draft PR #31 defers Summary / Evidence / Merge Danger, which the `pr` skill does not allow.

## What the human checked

Approved committing the change on `spec/15-clerk` and asked for it to be ready for the PR code review.

## Open questions

None. The review-script tests and `bun run check` pass.

## Artifacts

- `scripts/review-spec.ts`, `scripts/tests/review-spec.test.ts`, `docs/agents/integration-review.md`
- Branch `spec/15-clerk` (draft PR #31)
