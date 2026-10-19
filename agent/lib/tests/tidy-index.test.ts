import assert from "node:assert/strict";
import { test } from "node:test";
import { tidyIndex } from "../pages";

// The model edits the Index by find-and-replace, so lines land at the top of
// a section with stray blank lines. update_page tidies the Index after every
// edit: each section's lines sorted (by date for Obligations and Sources),
// no blank lines between them.

const FRONT =
  "---\ntitle: Index\nkind: index\n---\n\n# Index\n\nRead this first.\n";

test("sorts each section's lines and drops blank lines between them", () => {
  const messy = `${FRONT}
## Obligations

- 2026-11-15 insurance-renewal (active): [Insurance](obligations/b.md)


- 2026-09-30 permit-expiry (active): [Permit](obligations/a.md)

## Sources
- 2025-04-01 lease: [Lease](summaries/l.md)

- 2024-10-09 formation: [Articles](summaries/a.md)
`;
  assert.equal(
    tidyIndex(messy),
    `${FRONT}
## Obligations

- 2026-09-30 permit-expiry (active): [Permit](obligations/a.md)
- 2026-11-15 insurance-renewal (active): [Insurance](obligations/b.md)

## Sources

- 2024-10-09 formation: [Articles](summaries/a.md)
- 2025-04-01 lease: [Lease](summaries/l.md)
`
  );
});

test("leaves a tidy Index unchanged", () => {
  const tidy = `${FRONT}\n## Profile\n\n- [Northwind Repair LLC](profile.md): the Business.\n\n## Obligations\n`;
  assert.equal(tidyIndex(tidy), tidy);
});
