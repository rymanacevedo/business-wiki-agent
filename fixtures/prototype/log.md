---
title: Log
kind: log
sources: []
created: 2026-10-17
updated: 2026-10-18
status: active
flags: []
---

# Log

Append only, newest at the bottom. `- YYYY-MM-DD TYPE [subject]: detail`.

- 2026-10-17 INGEST [2024-10-21-ein-letter]: created summaries/2024-10-21-ein-letter.md; created profile.md with legal name, entity type, EIN, business start date, mailing address; indexed.
- 2026-10-17 MILESTONE [2024-10-09]: business started per the EIN letter (src: 2024-10-21-ein-letter).
- 2026-10-17 INGEST [2025-04-01-lease-harborview]: created summary, entities/harborview-properties.md, obligations/2026-12-31-lease-notice-harborview.md; added premises and lease facts to profile.md; indexed.
- 2026-10-17 MILESTONE [2025-04-01]: lease of 1480 Harbor Ave, Suite 210 commenced (src: 2025-04-01-lease-harborview).
- 2026-10-17 INGEST [2025-10-01-permit-city-clerk]: created summary (also Expense Record: other, $85.00, paid per the permit), obligations/2026-09-30-permit-expiry-city-clerk.md, expenses/other.md; added permit to profile.md licenses; indexed.
- 2026-10-17 INGEST [2025-11-15-insurance-cert-meridian]: created summary, obligations/2026-11-15-insurance-renewal-meridian.md; added insurance to profile.md; indexed.
- 2026-10-17 FLAG [conflict]: profile.md premises suite is 210 in the lease and 201 in the insurance certificate; both recorded, no primary value, no change_fact.
- 2026-10-17 INGEST [2026-09-12-invoice-cascade-parts-4471]: no duplicate candidate; created summary (Expense Record: supplies, $212.48, payment unknown), entities/cascade-appliance-parts.md, obligations/2026-10-12-pay-invoice-cascade-4471.md, expenses/supplies.md; indexed.
- 2026-10-17 LINT: 1 conflict (profile.md premises suite); 0 suspicious-content; 2 missed (permit expired 2026-09-30, no renewal in the wiki; invoice 4471 payment deadline 2026-10-12 passed, payment unconfirmed); 1 due within 30 days (insurance, 2026-11-15); 0 orphans.
- 2026-10-17 INGEST [2026-09-12-invoice-cascade-parts-4471-2]: duplicate of 2026-09-12-invoice-cascade-parts-4471 (number, total, date, line items match); listed under Also seen in; copy carries a PAID stamp 2026-10-14 check 1182, proposed change_fact (Record payment paid; Obligation done); indexed.
- 2026-10-17 APPROVAL [approved]: change_fact on summaries/2026-09-12-invoice-cascade-parts-4471.md payment unknown -> paid (evidence 2026-09-12-invoice-cascade-parts-4471-2) and obligations/2026-10-12-pay-invoice-cascade-4471.md active -> done, done_on 2026-10-14.
