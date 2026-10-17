# 0005: Verify the independent spec review wrapper works

- **When**: 2026-10-17, afternoon
- **Agent**: Claude Code (Claude Fable 5.1)
- **Driving**: ad hoc: "before we run the wayfinder verify this works: docs/agents/integration-review.md"

## Goal

Prove the `review:spec` workflow Codex built in run 0004 works against the real Codex CLI, not only against the fake executables in its tests.

## What happened

1. **Static checks**: the 11 wrapper tests and the full `check` script pass under Node 24. Codex CLI 0.163 is installed and logged in, `gh` is authenticated, Node 24.21 is available through nvm (`.nvmrc` selects it; the shell default is still 22, so `nvm use` is required). Every `codex exec` flag the wrapper passes exists in this Codex version.
2. **Lock path**: running the readiness check while a review held its lock returned "Review is still running" with exit 2, as documented.
3. **First live run failed closed**: the wrapper returned status `incomplete`, exit 2, and both axes reported the same Codex error: `collab spawn failed ... no rollout found`. The wrapper's fail-closed behaviour was correct; the review itself never happened.
4. **Diagnosis by two live probes** in throwaway git repos, same prompt, one subagent: with `--ephemeral` the spawn failed with the identical error; without it the subagent answered. Cause: Codex subagents load the parent thread's rollout, and an ephemeral session persists none. Probe directories had to be git repos, since Codex refuses untrusted directories.
5. **Fix**: removed `--ephemeral` from the wrapper with a comment explaining why, added a regression guard to the fake Codex in the tests (it now exits 9 if the flag reappears), and noted in the handoff doc that review sessions persist under `~/.codex`. Checks pass; committed as `d2e9e72`.
6. **Second live run worked end to end** in 83 seconds: both axes complete, Standards clean, Spec returned one blocking finding, exit 1. The readiness recheck reproduced exit 1 from the stored report in 30 ms with no model call and no lock left behind.

## Findings worth remembering

- The real Codex review of Codex's own feature found a genuine gap against AC3 of `docs/specs/integration-review.md`: the stale-review detection compares only final contents, HEAD, and worktree status. A change made during the review and restored before completion would not invalidate the result. This is left open for the repair loop the handoff doc describes; it is not fixed here.
- Codex's run 0004 flagged exactly this risk under open questions: the model boundary had only been tested with fakes. The first real invocation hit a flag incompatibility the fakes could not see.

## What the human checked

The human asked for verification before relying on the workflow. All findings above are agent-run; the human has not yet reviewed the AC3 finding or decided whether to repair it.

## Open questions

- Repair the AC3 finding, or accept it as a documented limitation for a solo repo where nothing edits files during a review.
- Review sessions now persist under `~/.codex`; decide whether that matters for spec and issue content.

## Artifacts

- Commit `d2e9e72` (fix). Stored report under `.git/review-spec/` for base `bc31d5d`, head `d2e9e72`.
