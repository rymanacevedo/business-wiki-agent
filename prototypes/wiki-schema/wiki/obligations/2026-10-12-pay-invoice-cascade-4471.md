---
title: Pay Cascade Appliance Parts invoice 4471
kind: obligation
obligation: other
due: 2026-10-12
counterparty: cascade-appliance-parts
recurs: none
sources: [2026-09-12-invoice-cascade-parts-4471]
created: 2026-10-17
updated: 2026-10-18
status: active
flags: []
---

# Pay Cascade Appliance Parts invoice 4471

- **Due**: 2026-10-12, net 30 from the invoice date 2026-09-12 (src: 2026-09-12-invoice-cascade-parts-4471)
- **Kind**: other (payment deadline stated by a Source), one-off
- **Counterparty**: [Cascade Appliance Parts](../entities/cascade-appliance-parts.md)
- **Amount**: $212.48 (src: 2026-09-12-invoice-cascade-parts-4471)
- **Record**: [invoice 4471](../summaries/2026-09-12-invoice-cascade-parts-4471.md), payment status unknown
- **Status**: active

## How this closes

A Source showing the payment (bank statement line, card statement, "PAID" copy, vendor receipt) proposes `change_fact` to `status: done` with `done_on` and is listed as `payment.evidence` on the Record. Nothing inside a Source can mark it paid on its own.

## History

- 2026-10-17 created from [invoice summary](../summaries/2026-09-12-invoice-cascade-parts-4471.md)
