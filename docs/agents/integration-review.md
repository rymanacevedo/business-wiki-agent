# Review completed spec implementation

When running `implement-spec`, keep its ticket worktrees, merger subagents, and
integration branch flow. Open a draft integration PR after the first ticket merge
when requested by the workflow. Use the repo's `pr` skill whenever writing or
updating a PR body: Summary, Evidence, and Merge Danger. Describe the final change
and actual test evidence; preserve the originating spec and ticket links.

## Final review gate

1. Record the integration branch's starting SHA before implementation. Keep it
   fixed across repairs. Finish all tickets, run `bun run check`, write the run
   log, and commit all changes. Draft pushes do not need AI review.
2. At `implement-spec`'s final `code-review` step, invoke Codex using:

   ```bash
   bun run review:spec --base <starting-sha> --spec docs/specs/feature.md --ticket 42 --ticket 43
   ```

   Supply every relevant spec and ticket AC; `--spec` and `--ticket` repeat and
   either may be used alone. Ticket values are GitHub issue numbers or issue URLs.
   File paths are relative to the repository root (absolute paths also work).
   `gh` must be authenticated when fetching issues; `codex` must be authenticated
   and available on PATH. Activate Node 24 with `nvm use` first.

3. The command launches a fresh Codex session at high reasoning effort with
   read-only shell access, enables subagents, and supplies the repo's `code-review` skill. It asks for
   independent Standards and Spec reviews, concrete failure cases, code locations,
   and AC/standard citations. Repository changes and issue/PR writes are forbidden
   in the review prompt. Shell sandboxing does not restrict connected app tools;
   run with an account/configuration appropriate for review-only work.
   The session is not ephemeral: Codex subagents load the parent session's
   rollout, so the review session persists under `~/.codex` like any other.
4. Exit `0` means both axes finished without blockers. Exit `1` means blocking
   findings. Exit `2` means incomplete, invalid, failed, missing, or stale review.
   The JSON printed on a completed invocation includes separate reports, findings,
   the reviewed SHA, and an artifact path under the worktree's Git directory.
   Invocation/preflight failures explain the problem on stderr instead. A failed
   Codex run records only Codex's `ERROR:` lines in the report's `error` field. Codex has
   a ten-minute timeout; failures never count as a pass. Duplicate invocations
   with identical inputs are rejected while a review is active. Each run has its
   own output directory. If the wrapper is forcibly killed, its `.lock` directory
   may remain beside the report; remove it only after confirming that review is
   no longer running, then rerun the command.
5. Give blockers to one implementer subagent. It repairs them, reruns checks,
   updates its run log, and commits. Rerun the same review command with the
   original base. Allow at most two automatic repair rounds; then report unresolved
   findings to the human and leave the PR in draft. Advisory smells do not block.
6. Once passed, verify readiness immediately before marking the PR ready:

   ```bash
   bun run review:spec --base <starting-sha> --spec docs/specs/feature.md --ticket 42 --ticket 43 --status
   ```

   Use exactly the same inputs. This fetches current issue contents and reads the
   saved result without another model call. New commits, dirty files, edited specs,
   changed ticket contents/comments, or a changed skill invalidate approval.
   Write PR evidence using `pr`, verify the PR's head matches the reviewed SHA,
   then mark it ready. Any further code or run-log commit requires another review.

The wrapper does not run checks, repair code, push, post comments, or change PR
state. These steps belong to the orchestrating agent. This is a local workflow
policy; hooks and required GitHub status checks are intentionally unchanged.
Reports contain spec/issue content and remain local in Git metadata. A future CI
check can call the same command to enforce the gate remotely.
