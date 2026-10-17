# Development tooling

Use Node.js 24 (`nvm use`) and Bun. Install with `bun install`, then run
`bun run check`. The pre-commit hook formats staged files with Prettier and runs
that same check command.

## Next.js lint rules

`.oxlintrc.json` was generated with `bunx @oxlint/migrate` from
`eslint-config-next@16.4.2/core-web-vitals` and `eslint-config-next/typescript`.
It includes Next.js, React, React Hooks, accessibility, and TypeScript rules.
General Oxlint correctness checks remain enabled. Warnings also fail the check.

Most rules run natively. `@next/eslint-plugin-next` supplies
`no-location-assign-relative-destination` through the `next-compat` alias, and
`eslint-plugin-react` supplies `no-deprecated` through `react-compat`.
`react/require-render-return` is explicitly enabled despite being classified as
nursery by Oxlint.

The migration omits `react-hooks/config` and `react-hooks/gating`: Oxlint uses
fixed React Compiler options and does not expose compiler gating configuration.
This is not complete ESLint preset parity. `react/jsx-uses-react` is unnecessary
with the modern JSX transform, while unused JSX variables are checked by
`no-unused-vars`.

Run `bun run lint` to check or `bun run lint:fix` to apply available fixes.
Next.js build output and `next-env.d.ts` are excluded. Update the migrated rules
when upgrading the Next.js preset version; simply enabling Oxlint's `nextjs`
plugin does not select the full recommended preset.
