# 0004: Independent review of completed spec implementation

- **When**: 2026-10-17
- **Agent**: Codex
- **Driving**: ad hoc: implement adversarial Codex review of Claude integration work

## Goal

Add a final integration review against the spec and ticket AC without interrupting
Claude's ticket implementation, commits, or draft pushes.

## What happened

Compared per-ticket, Git-hook, and final integration reviews. The human chose the
final integration approach and requested implementation. Added `review:spec`,
local copies of `code-review` and `pr`, and an `implement-spec` handoff. The command
captures Git/spec inputs, launches read-only Codex with parallel review axes, and
stores separate structured reports in Git metadata. Readiness rechecks reuse a
report only for unchanged inputs. The workflow limits automatic repairs to two.

Used the TDD skill at the human-approved command interface with temporary Git
repos and fake Codex/GitHub executables. Regression tests caught old output being
reused after an empty retry and specs changing during a review; both were fixed.
Independent Standards review found no issues. Spec review found two races:
concurrent reviews could overwrite model output, and readiness could reuse an
old SHA after ticket fetching changed HEAD. Added per-run outputs, exclusive
review locks, and final state checks, with regression tests for both findings.

## Findings worth remembering

CLI success does not mean review approval. Missing, stale, invalid, failed, and
unfinished reviews must prevent readiness. Run logs must be committed before
review because every later commit invalidates the reviewed SHA.

## What the human checked

The human chose `implement-spec`, Bun, Node 24, the `pr` body format, and command
integration tests with fake external executables.

## Open questions

The model boundary is tested with fakes, not a paid end-to-end Codex invocation.
Remote required status checks remain future work; readiness is an agent policy.

## Artifacts

- [Acceptance criteria](../specs/integration-review.md)
- [Agent handoff](../agents/integration-review.md)
- [Command](../../scripts/review-spec.ts)
