---
title: Last day to give non-renewal notice on the Harbor Ave lease
kind: obligation
obligation: lease-notice
due: 2026-12-31
counterparty: harborview-properties
recurs: none
sources: [2025-04-01-lease-harborview]
created: 2026-10-17
updated: 2026-10-18
status: active
flags: []
---

# Last day to give non-renewal notice on the Harbor Ave lease

- **Due**: 2026-12-31, which is 90 days before the term ends on 2027-03-31 (src: 2025-04-01-lease-harborview)
- **Kind**: lease-notice, one-off
- **Counterparty**: [Harborview Properties LLC](../entities/harborview-properties.md)
- **What the Source says**: without written non-renewal notice from either party by this date the lease renews for 12 months on the same terms (src: 2025-04-01-lease-harborview)
- **Status**: active

## How this closes

The Owner tells Clerk whether notice was given or the lease is to renew. Either way the fact is established, so recording the outcome goes through `change_fact` (status `done`, with the date and any Source such as a notice letter).

## History

- 2026-10-17 created from [lease summary](../summaries/2025-04-01-lease-harborview.md)
