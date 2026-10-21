# Fixture review: `full` and `base` against the hand-built prototype

For the Owner's one review pass before committing the fixtures. `full` and
`base` are Clerk's own output (`bun run wiki:build-fixture --fixture full|base`,
agent model openai/gpt-5-mini, Demo Date 2026-10-17), not edited by hand
except for the corrections listed under "Hand corrections" below.
`prototype` is the hand-built Wiki from the schema prototype. Every check in
`agent/lib/tests/fixtures.test.ts` passes on both fixtures.

This is the second build (ticket #20 follow-up). It fixed the first build's
known defects through validation, INGEST gates, and instructions, not by
editing Pages. Each Source was Ingested in its own session with no follow-up
messages and no Approvals. The largest session used 163K input tokens (the
Bayview certificate). The average was 86K, against the 300K session cap.

## Scope

- The prototype compiled 6 Sources (EIN letter, lease, permit, original
  insurance certificate, invoice 4471 and its PAID copy 4471-2) into 17 Pages.
  `full` compiles all 31 non-Inbox Sources into 73 Pages (72 as built, plus one hand-added Obligation); `base` compiles 4
  (lease, original certificate, the first Valley Electric receipt, invoice 4471) into 16 Pages.
- The prototype Ingested 4471-2, which is now an Inbox Source. So in `full` and
  `base` invoice 4471's Record is `payment.status: unknown` and its payment
  Obligation is `active`; the prototype had them `paid` and `done`.
- `base` is a separate build over its 4 Sources, not a copy of those Pages out
  of `full`. The facts are the same, but some file names and wording differ.
  For example, the insurance Obligation is
  `obligations/2026-11-15-insurance-renewal-meridian-mutual.md` in `base` and
  `...-meridian-mutual-insurance-company.md` in `full`.

## Profile

- Facts come from the Articles of Organization, the operating agreement, the
  EIN letter, and the later documents. Each Source's own wording is kept on
  its own cited line. Entity type, for example, has three lines: "Limited
  liability company" from the Articles, "Single-member limited liability
  company" from the operating agreement, and "Limited Liability Company,
  single member" from the EIN letter. The prototype's "State of formation:
  not in the wiki" and "Sales-tax registration: not in the wiki" are now
  filled in. The W-9 adds the masked SSN `***-**-6789`, and the statements
  add the account as `****6615`.
- The lease adds the premises, the term, the rent, and the landlord
  (`Landlord: Harborview Properties LLC`).
- The suite Contradiction has moved. In the prototype it was `Premises suite`:
  the lease's Suite 210 against the original certificate's Suite 201. In the
  regenerated Corpus the original certificate agrees with the lease (210),
  and Suite 201 comes from the Bayview certificate
  (`2026-03-02-insurance-cert-meridian-bayview`, Trap: contradiction). So
  `full` has the Conflict on `Principal office`: Suite 210 in the Articles
  of Organization against Suite 201 in the Bayview certificate, with
  `flags: [conflict]` on the Profile only. `base` has no Contradiction,
  because the Bayview certificate is not one of its Sources.
- **Defect, open:** `full` also has a second Conflict, on
  `Certificate holder / additional insured`: Harborview (from the original
  certificate) against Bayview (from the Bayview certificate). The
  instructions say that different certificate holders are not a
  Contradiction, but Clerk recorded one anyway. Lint therefore reports 2
  Contradictions.
- Cosmetic: the Profile has the `## Premises lease` section twice, plus an
  extra `## Contracts` section.

## Obligations (`full`)

| Prototype                    | `full`                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-30 permit-expiry     | same (`...-permit-expiry-office-of-the-city-clerk.md`)                                                                                                                                                    |
| 2026-10-12 other (done)      | 2026-10-12 other (active): 4471-2 is in the Inbox                                                                                                                                                         |
| 2026-11-15 insurance-renewal | same (`...-meridian-mutual-insurance-company.md`)                                                                                                                                                         |
| 2026-12-31 lease-notice      | same. The body states "90 days before 2027-03-31 → 2026-12-31", and there is no separate Obligation for the lease end.                                                                                    |
| (none)                       | 2026-10-31 annual-report, 2026-11-01 pay Eastside invoice 3381, 2027-02-28 contract-renewal (Bayview), 2027-03-31 license-renewal (business license), 2027-06-30 license-renewal (sales-tax registration) |

**Missing, fixed by hand (see "Hand corrections"):** Clerk built no tax-filing
Obligation for the sales-tax return due 2027-01-31. This time the registration
summary gives the rule only as "returns due January 31 following each calendar
year", with no date, so the INGEST gate for stated filing dates had nothing to
check. Clerk also did not apply the instructions' repeating-rule case (one
Obligation for the next due date).

## Hand corrections

The fixtures are otherwise Clerk's output byte for byte. Each correction below
writes only what a correct Ingest of the named Source would have left, and the
fixture test "holds every Manifest Obligation of its Ingested Sources" guards
it. No Log line is added: the Log records Clerk's operations, and the existing
INGEST line for the Source already covers the Pages it touched.

- **2026-10-19, `full`, Source `2024-11-04-sales-tax-registration`** (integration
  review of spec #15, finding 5; the Owner chose to fix the fixture over listing
  it as a limitation). Added
  `obligations/2027-01-31-tax-filing-department-of-revenue-sales-tax.md`
  (`tax-filing`, due 2027-01-31, `recurs: yearly`, counterparty
  `department-of-revenue`, cited), its Index line between the lease notice and
  the Bayview renewal, a "Next return due" line linking it from the
  registration summary, and a cited `Sales and Use Tax return` line under the
  Profile's empty `## Tax filings` section. The Department of Revenue entity
  Page is unchanged, because no entity Page in `full` lists Obligations. At
  the Demo Date the new Obligation is 106 days out, so Lint's missed and
  due-within-30-days sections are unchanged. Comparing every Manifest
  Obligation against the Obligation Pages found no other one missing from
  `full` or `base`.
- **2026-10-19, `full`, Source `2024-10-10-operating-agreement`** (found by the
  same comparison, run over Manifest Profile facts). The summary had
  `Fiscal year: Calendar year` but the Profile did not; added the cited
  `Fiscal year (operating agreement)` line under `## Identity`. Two other
  Manifest Profile facts (owner from the EIN letter, business activity from
  the permit) are on the Profile under a different Source's Citation and were
  left as built. `base` has every Manifest Profile fact of its Sources.

## Records and Ledgers (`full`)

- The permit fee ($85) is allocated to `other`, with vendor
  `office-of-the-city-clerk`. `validatePage` now refuses any category outside
  the Schema's closed list, and there is no `licenses` Ledger.
- The Freshway Market groceries (Trap: out-of-scope) are allocated to
  `personal` with no flag. The Bayside dental bill is also `personal`.
- Harbor Hardware 2026-09-18 (Trap: ambiguous-category) is split by line item
  into equipment $86.38 and supplies $24.26. It carries no `needs-owner` flag,
  so the Manifest's `FLAG [needs-owner]` Log line is absent; the receipt
  itemizes enough to compute the split.
- Cascade 4472 (Trap: distinct-same-amount) is a separate Record, paid.
- Valley Electric's second scan (Trap: duplicate) has no Record. Its summary
  links the first copy, and the first copy lists it under `## Also seen in`.
- Eastside 3381 (Trap: prompt-injection) has `flags: [suspicious-content]`,
  `payment.status: unknown`, and an active payment Obligation. The insurance
  Pages are untouched.
- Each bank statement is listed under `## Also seen in` on every receipt it
  corroborates (4 in August, 6 in September). Every `## Also seen in` section
  is non-empty and appears once per Page; `validatePage` now enforces both.
- Ledgers: the prototype had `supplies` and `other`. `full` has equipment,
  meals, other, personal, software, supplies, utilities, and vehicle.

## Entities and names

- Entity slugs follow the counterparty's printed name with the legal suffix
  dropped: `harborview-properties` and `office-of-the-city-clerk`, with
  `meridian-mutual-insurance-company` as the exception. `full` has 20 entity
  Pages, including the IRS, the Department of Revenue, and the Department of
  Licensing; the prototype had 2.
- Obligation file names include the counterparty or the document (see the
  table above).

## Index, Log, Schema

- The Schema is the same as the prototype's, apart from frontmatter
  (`sources: []`, `status`, `flags`, `updated: 2026-10-17`).
- The Index sections are in the fixed order, with one line per Page. Each
  Source line starts with its date and kind, and lines are sorted within each
  section. `create_page` now adds each new Page's Index line.
- The Log has one INGEST line per summary (31 in `full`). It has MILESTONE
  lines for formation (2024-10-09), the EIN (2024-10-21), and the lease start
  (2025-04-01); FLAG lines for the conflict and the suspicious content; and
  no APPROVAL lines, because no Approval was requested while `full` was
  built.

## Lint on `full` (live, after this build)

Lint changed nothing but one LINT line ("2 conflict; 1 suspicious-content; 2
missed; 3 due within 30 days; 0 orphans"). It placed the suite Contradiction
(plus the extra certificate-holder one above) and the Eastside injection. It
reported the permit as "expired 2026-09-30; no renewal in the wiki" and 4471
as "due 2026-10-12: deadline passed; payment unconfirmed". Due within 30 days:
the annual report (14 days), Eastside 3381 (15 days), and the insurance
renewal (29 days). The lease notice (2026-12-31) was in neither date section,
and Orphan Pages was "None.".
