# Independent integration review

Review completed `implement-spec` work once before its integration PR is marked
ready, keeping ticket implementation, commits, and draft pushes uninterrupted.

## Acceptance criteria

1. A Bun command accepts an explicit Git base and one or more local spec files
   and/or GitHub issues containing the spec and ticket acceptance criteria.
2. It reviews a clean, nonempty committed integration diff using a fresh,
   read-only Codex process and the `code-review` skill. Standards and Spec are
   independent parallel reviewers; reports remain separate.
3. Capture the base, merge-base, HEAD, and spec contents. Persist structured
   findings and identify the exact reviewed commit. Reusing an approval requires
   unchanged inputs and a clean worktree; changes during review invalidate it.
4. Concrete blocking findings prevent readiness. Advisory findings do not.
   Invalid output, missing specs, failed subprocesses, and incomplete reviews
   cannot approve work. Process success alone is insufficient.
5. Document the integration handoff: Claude repairs concrete findings, reruns
   checks and commits, then requests another review. Stop after two repair rounds
   for unresolved disagreements. Use the `pr` skill for PR descriptions.
6. Keep AI review outside commit/push hooks. Do not automatically merge, mark a
   PR ready, or publish review comments. This initial implementation provides a
   local command and agent workflow policy, not an enforced remote status check.
7. Test the public command in temporary Git repositories with fake external
   executables, as agreed. Declare and verify Node 24 compatibility.
