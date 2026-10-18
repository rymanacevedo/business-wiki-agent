---
title: City operating permit BP-2025-0918 expires
kind: obligation
obligation: permit-expiry
due: 2026-09-30
counterparty: null
recurs: yearly
sources: [2025-10-01-permit-city-clerk]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# City operating permit BP-2025-0918 expires

- **Due**: 2026-09-30 (src: 2025-10-01-permit-city-clerk)
- **Kind**: permit-expiry, recurs yearly
- **Agency**: Office of the City Clerk (src: 2025-10-01-permit-city-clerk)
- **What the Source says**: renew before expiry; renewals accepted up to 60 days before; permit must be displayed; operating without it may carry penalties (src: 2025-10-01-permit-city-clerk)
- **Status**: active. Against the Demo Date 2026-10-17 this is **missed** (Lint derives this; it is not stored).

## How this closes

A renewed permit Source with a new number or expiry proposes a Supersession through `change_fact`. On Approval this Page becomes `status: superseded` and the new permit gets its own Obligation Page.

## History

- 2026-10-17 created from [permit summary](../summaries/2025-10-01-permit-city-clerk.md)

## Related

- [Profile](../profile.md): licenses, permits, and registrations
