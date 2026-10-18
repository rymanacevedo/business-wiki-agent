export const record = `---
title: Cascade Appliance Parts invoice 4471
kind: summary
sources: [2026-09-12-invoice-cascade-parts-4471]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
expense:
  vendor: cascade-appliance-parts
  date: 2026-09-12
  amount: 212.48
  currency: USD
  document: "4471"
  allocations:
    - { category: supplies, amount: 212.48 }
  payment:
    status: unknown
    due: 2026-10-12
    evidence: []
---

# Cascade Appliance Parts invoice 4471

- Payment: unknown (src: 2026-09-12-invoice-cascade-parts-4471)
`;

export const obligation = `---
title: General liability policy GL-2025-77410 expires
kind: obligation
obligation: insurance-renewal
due: 2026-11-15
counterparty: null
recurs: yearly
sources: [2025-11-15-insurance-cert-meridian]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# General liability policy GL-2025-77410 expires

- **Due**: 2026-11-15 (src: 2025-11-15-insurance-cert-meridian)
- **Status**: active

## History

- 2026-10-17 created from the certificate summary
`;

export const profile = `---
title: Northwind Repair LLC
kind: profile
sources: [2024-10-21-ein-letter, 2025-04-01-lease-harborview]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Northwind Repair LLC

## Identity

- **EIN**: 88-1234567 (src: 2024-10-21-ein-letter)
- **State of formation**: not in the wiki (Articles of Organization not yet ingested)

## Addresses

- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)
`;
