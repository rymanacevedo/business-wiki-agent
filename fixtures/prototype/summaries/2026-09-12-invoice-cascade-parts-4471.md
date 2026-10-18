---
title: Cascade Appliance Parts invoice 4471
kind: summary
sources:
  [
    2026-09-12-invoice-cascade-parts-4471,
    2026-09-12-invoice-cascade-parts-4471-2,
  ]
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
    status: paid
    due: 2026-10-12
    evidence: [2026-09-12-invoice-cascade-parts-4471-2]
---

# Cascade Appliance Parts invoice 4471

**Document**: supplier invoice #4471 dated 2026-09-12, net 30, due 2026-10-12. Source `2026-09-12-invoice-cascade-parts-4471`. This Page is the **Expense Record**.

## Expense Record

- Vendor: [Cascade Appliance Parts](../entities/cascade-appliance-parts.md)
- Date 2026-09-12, total **$212.48** (subtotal $195.50, tax $15.64, shipping $1.34) (src: 2026-09-12-invoice-cascade-parts-4471)
- Allocation: `supplies` $212.48. Repair parts for customer jobs; none is a durable tool, so not `equipment`.
- Payment: **paid** on 2026-10-14 by check 1182, per the PAID stamp on the second copy (src: 2026-09-12-invoice-cascade-parts-4471-2). Approved 2026-10-17. Was `unknown` from 2026-10-17 until then; the invoice itself is not evidence of payment. Deadline Obligation: [Pay invoice 4471](../obligations/2026-10-12-pay-invoice-cascade-4471.md), done.
- Duplicate check at creation: no existing Record for this vendor on 2026-09-12; document number 4471 was new.

## Line items

| Qty | Item                               | Unit  | Total |
| --- | ---------------------------------- | ----- | ----- |
| 2   | Compressor start relay (universal) | 18.75 | 37.50 |
| 1   | Refrigerator door gasket kit, 30"  | 64.20 | 64.20 |
| 4   | Dryer drum roller (pack of 2)      | 11.95 | 47.80 |
| 1   | Washer inlet valve, dual           | 46.00 | 46.00 |

(src: 2026-09-12-invoice-cascade-parts-4471)

## Other facts

- Customer number NR-0142 at this vendor (src: 2026-09-12-invoice-cascade-parts-4471)
- Vendor ACH details given as routing ****0021, account ****6789 (masked by read_source) (src: 2026-09-12-invoice-cascade-parts-4471)

## Pages touched

- [Cascade Appliance Parts](../entities/cascade-appliance-parts.md): created
- [Pay invoice 4471 Obligation](../obligations/2026-10-12-pay-invoice-cascade-4471.md): created, later done
- [supplies ledger](../expenses/supplies.md): row added

## Also seen in

- `2026-09-12-invoice-cascade-parts-4471-2`: second copy, same number, total, date, and line items, so no second Record. Carries a PAID stamp (10/14/2026, check 1182) the first copy did not: payment evidence, applied through `change_fact`, approved 2026-10-17.
