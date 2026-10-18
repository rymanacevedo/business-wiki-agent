# 0012: React to the Wiki schema prototype

- **When**: 2026-10-17
- **Agent**: Codex
- **Driving**: ad hoc: review the seven conventions proposed for the Wiki prototype

## Goal

Give an evidence-based reaction to the hand-written Wiki before the Owner settles
its conventions on the human-in-the-loop prototype ticket.

## What happened

Read Schema, Index, Log, Profile, variants, and representative Sources and Pages
on `prototype/wiki-schema` at `75b80b8`, without checking out the branch. Read the
prototype ticket and settled corpus conventions. Recommended A for choices 1, 2,
4, 5, 6, and 7, and B for Contradiction display while preserving the established
value in history. First recorded must not become an implicit truth ranking.

Identified unsafe duplicate matching, missing split-category representation,
explicit paid-fee evidence being discarded, derived status stored in prose, and
Source facts being strengthened into unsupported formation/move claims. Raised
whether the invoice's dated payment requirement belongs among Obligations.

## Findings worth remembering

A single invoice may need multiple category allocations. Vendor/date/amount alone
is not proof of duplication. A document kind does not determine whether its text
contains payment evidence. The Index needs lifecycle status if it answers due-date
Queries without opening Obligation Pages.

## What the human checked

No convention choices have been confirmed by the human in this session.

## Open questions

The Owner must select conventions and resolve the identified gaps before the
prototype ticket is closed. No issue comments, closures, or prototype edits made.

## Artifacts

- [Prototype ticket](https://github.com/rymanacevedo/business-wiki-agent/issues/10)
- [Prototype branch](https://github.com/rymanacevedo/business-wiki-agent/tree/prototype/wiki-schema/prototypes/wiki-schema)

## Follow-up verification, 2026-10-18

At the human's request, committed this entry as `66bd6dd` (renumbered from 0010
because Claude's 0011 had landed), then reviewed Claude's prototype update
`31f7dc0` against `75b80b8` and main's glossary/run update `8343d0e` against
`0ce9728`. Independent Standards and Spec subagents checked the committed diffs.

Most earlier requests are reflected: equal Contradiction claims, lifecycle status
in the Index, Allocations, permit payment evidence, absolute-date Pages, and
Source-faithful business-start/lease-commencement wording. The added invoice
Obligation was an agent decision, explicitly flagged in Claude's run.

Standards found two internal inconsistencies: the payment/Approval rules disagree,
and the duplicate-stop rule can discard payment evidence. Spec found four gaps:
matching numbers bypass content checks; duplicate handling drops newly supplied
payment evidence; summary updates can bypass the claimed payment Approval gate;
and unknown payment is reported as missed rather than unconfirmed. Standards' two
findings overlap Spec's findings; these are separate review axes, not six distinct
issues. No prototype files or tickets were changed by this verification.

## Second follow-up verification, 2026-10-18

Reviewed prototype `d5e3d4d` against `31f7dc0` and run-log amendment `d4dae5d`
against `0476dc7`, again using independent Standards and Spec reviewers. All four
previous Spec findings are resolved. The sixth Source is a PAID-stamped invoice
copy: substantive content confirms the existing Record, new payment evidence
proposes one Approval, and the Record, Obligation, Index, Ledger, entity, and Log
agree after it. Initial payment evidence is distinguished from later changes, and
Lint qualifies payment uncertainty.

One Standards finding remains: the canonical `GLOSSARY.md` definitions of
Established Fact and Approval still cover only Profile/Obligation facts, while
the prototype Schema now also protects `expense.payment` on every Expense Record.
Both glossary definitions should reflect that expansion. Spec has no remaining
findings within the requested four fixes. This is verification of hand-written
prototype documents, not executable payment/Approval enforcement. No prototype or
glossary edits made by this review.
