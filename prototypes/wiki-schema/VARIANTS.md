# Variants: conventions with a live alternative

The wiki in `wiki/` commits to one option for each. The alternative is shown so the
Owner can react to both. **A** is always what the prototype uses.

## 1. Index shape

**A (used): sectioned list, one line per Page, structured prefix on Obligations and Sources.**

```markdown
## Obligations
- 2026-11-15 insurance-renewal: [General liability policy GL-2025-77410 expires](obligations/2026-11-15-insurance-renewal-meridian.md): Meridian Mutual, $1M per occurrence.
```

**B: one flat table.**

```markdown
| Kind | Page | Summary | Updated |
|---|---|---|---|
| obligation | [GL-2025-77410 expires](obligations/2026-11-15-insurance-renewal-meridian.md) | due 2026-11-15, Meridian Mutual | 2026-10-17 |
```

A reads well in Markdown and keeps "what is due" answerable from the Index alone. B
is easier to parse deterministically but harder for the model to edit line by line.

## 2. Where an Expense Record lives

**A (used): the Source's summary Page *is* the Expense Record** (`expense:` block in its
frontmatter), **plus a per-category ledger** (`expenses/supplies.md`) whose rows link
back. Checks read the frontmatter; the Owner reads the ledger at tax time; the
duplicate check scans the ledger.

**B: no ledgers.** Records only; "how much did I spend on supplies" is a `search_wiki`
over frontmatter. Fewer Pages to keep consistent, weaker Index-first retrieval.

**C: ledger rows only, no per-receipt Page.** Cheapest Ingest, but a receipt's line items
and Citations have nowhere to live, and the Karpathy pattern of one summary per Source breaks.

## 3. How a Contradiction is displayed

**A (used): keep the first-established value, nest the conflict under it.**

```markdown
- **Premises**: 1480 Harbor Ave, Suite 210 (src: 2025-04-01-lease-harborview)
  - ⚠ **Conflict**: insurance certificate says Suite 201 (src: 2025-11-15-insurance-cert-meridian). Unresolved since 2026-10-17.
```

**B: show no primary value until resolved.**

```markdown
- **Premises suite**: ⚠ CONFLICT, 210 (src: 2025-04-01-lease-harborview) or 201 (src: 2025-11-15-insurance-cert-meridian), unresolved since 2026-10-17
```

A keeps Queries answerable ("Suite 210, though the insurance certificate disagrees").
B never lets Clerk state a disputed value as fact.

## 4. Obligation status

**A (used): store only `active | done | superseded`; Lint derives "missed" and "due
within 30 days" from `due` against the Demo Date.** Pages never go stale on their own.

**B: store `upcoming | due-soon | missed | done` in frontmatter.** Readable at a glance,
but every Lint would have to rewrite Pages, and a stale status is a wrong fact.

## 5. Log entry shape

**A (used): one line per entry, `- date TYPE [subject]: detail`.** Appendable with one
tool call, greppable by TYPE, the Timeline is `MILESTONE` lines.

**B: a heading per operation with bullet detail.**

```markdown
## 2026-10-17 INGEST 2026-09-12-invoice-cascade-parts-4471
- created summaries/2026-09-12-invoice-cascade-parts-4471.md
- created entities/cascade-appliance-parts.md
```

B is richer; A keeps the Log small enough to read whole for a long time.

## 6. Citation form

**A (used): `(src: <source-id>)` inline after the fact.** Regex-friendly for the
"every Profile fact has a Citation" check; the id is also the `read_source` argument.

**B: Markdown footnotes `[^2026-09-12-invoice-cascade-parts-4471]`.** Cleaner prose,
but footnote blocks drift to the bottom and the model edits them badly.

**C: a link to the raw path `[src](../sources/…md)`.** Only works if Sources and Pages
share a filesystem, which the persistence research says they will not in production.

## 7. Directory layout

**A (used): directories by Page kind** (`summaries/`, `entities/`, `obligations/`,
`expenses/`). Paths tell you the kind; `obligations/` sorts by due date.

**B: one flat `pages/` directory, kind only in frontmatter.** Simpler store, but a listing
tells you nothing and the Index becomes the only map.

## Also decided in SCHEMA.md without a variant

Source ids are `YYYY-MM-DD-<slug>` from the document's own date; frontmatter is required
on every Page with a fixed field set; only Profile and Obligation facts are "established";
duplicates append to `## Also seen in`; masked numbers are written as received
(`****6789`); a certificate or permit is not proof of payment, so it creates no Expense Record.
