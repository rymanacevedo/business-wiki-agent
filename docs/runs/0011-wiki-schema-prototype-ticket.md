# 0011: Resolve the wiki schema prototype ticket

- **When**: 2026-10-17 to 2026-10-18
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Prototype: wiki schema with a handful of seed documents](https://github.com/rymanacevedo/business-wiki-agent/issues/10)

## Goal

Work through the map: take the next frontier ticket and resolve it. The ticket was a prototype: make the Wiki concrete before the Schema is specified, and react to it.

## What happened

1. Queried the frontier (schema prototype, persistence shape, eval design open and unblocked); claimed the prototype ticket as first in map order.
2. Hand-built a Wiki for Northwind Repair LLC on throwaway branch `prototype/wiki-schema` under `prototypes/wiki-schema/`: five raw Sources (EIN letter, lease, city permit, insurance certificate, parts invoice) chosen so every Page kind appears once and the seed exercises a missed and a due-soon Obligation, the suite-number Contradiction, an Expense Record with Ledger, Masking, and a Timeline. The prototype skill's logic and UI branches did not fit a Markdown artifact, so the variations went into a `VARIANTS.md` of side-by-side excerpts for seven contested conventions.
3. The human read it and chose A (the prototype's option) for Index shape, Record placement, derived urgency, Log shape, Citation form, and directory layout, and B for Contradictions: both claims shown equally, no primary value. They also asked for lifecycle status on Index Obligation lines.
4. The human raised five gaps, all accepted: duplicate detection confirmed by document number and content, not vendor+amount+date alone; Allocations so a receipt can split across categories; payment as evidence rather than document kind (a permit stating its fee paid is a Record, an invoice is unknown until evidence); no urgency prose on Pages; Source claims stated in the Source's own terms.
5. One scope question the human left open, whether an invoice's due date is an Obligation, was decided by the agent and flagged: yes, kind `other`, closed by approved payment evidence, because it keeps unpaid past-due invoices visible in Lint and makes "mark paid" always an approved change.
6. Rewrote the prototype Schema and Pages to match, posted the resolution with eval implications, closed the ticket, appended the gist to the map, left pointers on the persistence and eval-design tickets, and added Allocation, Ledger, Established Fact to `GLOSSARY.md`.

7. After resolution, the human relayed a Codex review of the prototype: two Standards findings (payment described as both automatic and Approval-gated; duplicate handling said "stop" and so would drop new payment evidence) and four Spec findings (a PAID-stamped copy would be skipped; number-only matching can collapse different documents; summaries were freely editable so payment status bypassed Approval; "missed payment" overstated what the Wiki knows). All accepted. Fix: `expense.payment` is an Established Fact on every Record; evidence proposes one `change_fact` covering Record and Obligation; duplicates need number and content to match and are still read for new facts; Lint says "deadline passed; payment unconfirmed"; Source ids get `-2` on collision. A stamped copy of the invoice was added to the seed to show the flow. Amendment posted on the ticket, map gist tightened. A third review found the glossary's Established Fact and Approval entries still named only Profile and Obligation facts; both now include a Record's payment block.

## Findings worth remembering

- "Established" is a protection level, not a truth claim. Writing that sentence into the Schema removed the temptation to let the first-recorded value win a Contradiction.
- Storing urgency on a Page is a stale fact waiting to happen; computing it from `due` against the Demo Date is one line of rule and zero maintenance.
- Treating invoice due dates as Obligations aligns the injection Trap with the Approval boundary for free: the injected "mark this invoice paid" is exactly the change that always needs the Owner. The review showed that only holds if the Record's payment block is itself Established; an Approval gate on the Obligation alone leaves the summary as a side door.
- A duplicate is not a no-op. The copy that looks redundant is often the one carrying the new fact (a stamp, a note), so "skip duplicates" must mean "no second Record", never "do not read".
- The duplicate rule needs a negative eval case (two distinct invoices sharing vendor, amount, and date) that the Corpus does not yet contain.

## What the human checked

- Read the full prototype and chose every variant themselves, overturning the agent's recommendation on Contradiction display.
- Found the five gaps; the agent had missed all of them.
- Ran a second review (via Codex) that found six more consistency gaps in the agent's fixes, and relayed them; the agent had declared the ticket done with those in place.
- Did not decide the invoice-deadline question; the agent's call is flagged on the ticket for them to overturn.

## Open questions

- Whether `other` Obligations for the four Corpus invoices add too much Approval traffic to the demo; the eval-design ticket will see the cost.
- Whether the Corpus gains the negative duplicate Source; a note for the eval-design ticket, not a decision.
- Run entry 0010 (another session, uncommitted when this was written) covers the human's review of the same prototype.

## Artifacts

- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/10#issuecomment-6245524069
- Prototype: https://github.com/rymanacevedo/business-wiki-agent/tree/prototype/wiki-schema/prototypes/wiki-schema (commits 75b80b8, 31f7dc0, and the review-fix commit after)
- Amendment: https://github.com/rymanacevedo/business-wiki-agent/issues/10 (second resolution comment)
- `GLOSSARY.md` (Expense Record updated; Allocation, Ledger, Established Fact added), this run file.
