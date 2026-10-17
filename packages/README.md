# Deep modules

Copy or delete `example/` when adding the first real package. Keep packages flat:

```text
packages/
  <name>/
    index.ts          # public entry point
    client.ts         # optional additional entry point
    lib/              # private implementation, may nest
    tests/            # tests and fixtures
```

**Entry points:** Import only through a package's entry points (its root files).
Every subfolder is private, regardless of its name. Avoid barrel files that
re-export a whole subtree; expose several small entry points with a small
interface instead.

**Implementation:** A package's implementation may freely import its own files.
By convention, implementation lives in `lib/`. Keep test fixtures in `tests/`;
production files cannot import them.

**Tests:** Files in `tests/` exercise any package through its entry points and may
import their own test fixtures. They cannot import any package's private
implementation, including their own.

**Cycles:** Dependency cycles are errors. Run `bun run lint:boundaries` to check
these rules, or `bun run check` to also run type checking and tests. Layering
(which packages may depend on which) is left as a commented config stub.
