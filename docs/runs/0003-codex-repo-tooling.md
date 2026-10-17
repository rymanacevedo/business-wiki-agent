# 0003: Repo tooling and package layout (Codex)

- **When**: 2026-10-17, 11:53 to 11:55
- **Agent**: Codex (reconstructed from commit `5ae241b` by the Claude Code session that wrote this entry; Codex did not write its own log)
- **Driving**: ad hoc: set up pre-commit hooks and a package layout

## Goal

Give the repo formatting, linting, type checking, and test hooks before any agent code lands.

## What happened

- Added husky with a pre-commit hook that runs lint-staged (Prettier) and then `bun run check` (dependency-cruiser boundaries, `tsc`, `bun test`).
- Added `packages/` with a deep-module convention documented in `packages/README.md` and an `example` package to copy or delete.
- Made `CLAUDE.md` a symlink to a new `AGENTS.md` so both tools read one file, and appended a pointer to the packages README.
- Added `.gitignore` for `node_modules/` and `.claude/worktrees/`.

## Findings worth remembering

- The hook runs the full `check` script on every commit. Commits that only touch docs still pay for it; a commit made while another session has `package.json` half-edited can fail for unrelated reasons.
- Uncommitted at the time of writing: an `.agents/skills/migrate-oxlint` skill, `.oxlintrc.json`, `skills-lock.json`, and edits to `package.json` and `bun.lock`. Whoever commits those should add the reason here or in a new run entry.

## What the human checked

Unknown; Codex ran this. Record it here if you reviewed the hook or the package rules.

## Open questions

- Whether the Eve project should live at the repo root (Eve expects `agent/` and `evals/` beside `package.json`) or inside `packages/`. The Eve primer research says the init template owns `package.json`, `tsconfig.json`, and `agent/`, so a root-level Eve app with `packages/` for shared libraries is the likely shape. Decide in the persistence and deployment ticket.

## Artifacts

- Commit `5ae241b`.
