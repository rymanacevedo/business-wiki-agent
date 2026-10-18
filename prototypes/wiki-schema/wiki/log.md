---
title: Log
kind: log
sources: []
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Log

Append only, newest at the bottom. `- YYYY-MM-DD TYPE [subject]: detail`.

- 2026-10-17 INGEST [2024-10-21-ein-letter]: created summaries/2024-10-21-ein-letter.md; created profile.md with legal name, entity type, EIN, start date, mailing address; indexed.
- 2026-10-17 MILESTONE [2024-10-09]: Northwind Repair LLC started business (src: 2024-10-21-ein-letter).
- 2026-10-17 INGEST [2025-04-01-lease-harborview]: created summary, entities/harborview-properties.md, obligations/2026-12-31-lease-notice-harborview.md; added premises and lease facts to profile.md; indexed.
- 2026-10-17 MILESTONE [2025-04-01]: moved into 1480 Harbor Ave, Suite 210 (src: 2025-04-01-lease-harborview).
- 2026-10-17 INGEST [2025-10-01-permit-city-clerk]: created summary, obligations/2026-09-30-permit-expiry-city-clerk.md; added permit to profile.md licenses; indexed.
- 2026-10-17 INGEST [2025-11-15-insurance-cert-meridian]: created summary, obligations/2026-11-15-insurance-renewal-meridian.md; added insurance to profile.md; indexed.
- 2026-10-17 FLAG [conflict]: profile.md premises suite is 210 in the lease and 201 in the insurance certificate; kept 210, recorded conflict, no change_fact.
- 2026-10-17 INGEST [2026-09-12-invoice-cascade-parts-4471]: created summary (Expense Record: supplies, $212.48), entities/cascade-appliance-parts.md, expenses/supplies.md; indexed.
- 2026-10-17 QUERY ["When does my liability insurance expire?"]: read index.md, obligations/2026-11-15-insurance-renewal-meridian.md; answered 2026-11-15 with 1 Citation.
- 2026-10-17 LINT: 1 conflict (profile.md premises); 0 suspicious-content; 1 missed (permit, due 2026-09-30); 1 due within 30 days (insurance, 2026-11-15); 0 orphans.
