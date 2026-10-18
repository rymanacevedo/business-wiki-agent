# Clerk

Clerk is an agent a solo small-business owner trusts to keep their business records in a wiki it maintains for them, so they can find any fact with its source and never miss a dated obligation.

## Language

### People and things

**Owner**:
The solo small-business owner who is also their own bookkeeper and the only human Clerk talks to.
_Avoid_: User, customer, client, bookkeeper

**Clerk**:
The agent itself.
_Avoid_: Assistant, bot, the AI

**Source**:
An immutable raw document the Owner gives Clerk, such as a receipt, invoice, lease, license, or formation paper. Clerk reads Sources and never edits them.
_Avoid_: Raw doc, upload, file, attachment

**Business**:
The single legal entity whose records the wiki holds.
_Avoid_: Company, org, tenant

### The wiki

**Wiki**:
The set of Pages Clerk writes and maintains about the Business, compiled from Sources.
_Avoid_: Knowledge base, KB, vault, memory

**Page**:
One Clerk-maintained Markdown document in the Wiki, citing the Sources it was compiled from.
_Avoid_: Note, article, entry, document

**Index**:
The catalog Page listing every Page with a one-line summary. Clerk reads it first on every Query.
_Avoid_: Table of contents, sitemap, catalog

**Log**:
The append-only chronological Page recording every Ingest, Query, and Lint, and the Business's milestones.
_Avoid_: History, audit trail, changelog, timeline

**Profile**:
The Page holding who the Business is: legal name, entity type, EIN, addresses, owners, licenses held, bank and insurance providers.
_Avoid_: About page, company info, identity

**Obligation**:
A dated thing the Business must do, with a deadline and a Source: a license or permit expiry, insurance renewal, filing date, or lease notice window.
_Avoid_: Deadline, compliance item, task, reminder, due date

**Expense Record**:
The summary Page of a Source that evidences a business expense: vendor, date, total, one or more Allocations, and payment status with its evidence, citing its Source.
_Avoid_: Receipt page, transaction, expense, line item

**Allocation**:
The share of an Expense Record's total assigned to one expense category. A Record has one or more Allocations and they sum to its total.
_Avoid_: Split, portion, category share, line

**Ledger**:
The derived Page for one expense category listing every Allocation to it, each row linking back to its Expense Record. The Record is authoritative; the Ledger is a view.
_Avoid_: Report, rollup, summary table, spreadsheet

**Established Fact**:
A fact on the Profile or an Obligation Page, or the payment block of an Expense Record, which Approval protects from change. Established means protected from unapproved change, never verified as true.
_Avoid_: Verified fact, confirmed fact, canonical value, truth

**Schema**:
The conventions document that tells Clerk how the Wiki is structured and maintained.
_Avoid_: Config, rules, template

### Operations

**Ingest**:
Compiling one Source into the Wiki: writing or updating Pages, the Index, and the Log.
_Avoid_: Upload, import, process, index (verb)

**Query**:
Answering the Owner's question from the Wiki, Index first, with citations to Pages and Sources.
_Avoid_: Search, ask, chat, retrieve

**Lint**:
A health check of the Wiki for contradictions, stale facts, orphan Pages, and upcoming or missed Obligations.
_Avoid_: Audit, review, scan, check

**Approval**:
The Owner's explicit yes, requested before Clerk changes an Established Fact: a Profile or Obligation fact, an Expense Record's payment status, or one side of a Contradiction.
_Avoid_: Confirmation, permission, sign-off, consent

**Citation**:
A reference from a Page or an answer back to the Source or Page it came from.
_Avoid_: Reference, link, footnote

### The seed corpus

**Corpus**:
The fixed set of Sources the demo and evals Ingest.
_Avoid_: Dataset, fixtures, raw docs, seed documents

**Bible**:
The table of canonical facts about the Business from which every Source in the Corpus is generated.
_Avoid_: Fact sheet, seed data, business config

**Trap**:
A Source planted in the Corpus to provoke a specific failure Clerk must handle correctly.
_Avoid_: Edge case, adversarial example, tricky document

**Manifest**:
The machine-readable record of what each Source in the Corpus should contribute to the Wiki, which deterministic checks read as ground truth.
_Avoid_: Ground truth, labels, expected outputs, answer key

**Inbox**:
The Sources Clerk has been given but has not yet Ingested.
_Avoid_: Queue, pending documents, new documents, uploads

**Demo Date**:
The frozen date Clerk treats as today, against which an Obligation is upcoming or missed.
_Avoid_: Now, current date, wall clock

### Trust

**Contradiction**:
Two Sources asserting different values for one established fact, recorded on the Page with both values and both Citations until the Owner resolves it.
_Avoid_: Conflict, discrepancy, mismatch

**Supersession**:
A newer Source of the same kind that legitimately replaces an established fact, such as a renewed certificate or policy.
_Avoid_: Update, renewal, replacement, overwrite

**Masking**:
Reducing an SSN or financial account number to a non-identifying form before Clerk ever reads it, so the full value exists only in the Source.
_Avoid_: Redaction, scrubbing, anonymisation, PII filter

**Suspicious Content**:
Instruction-like text found inside a Source, flagged on its Page and in the Log and never followed.
_Avoid_: Injection, attack, malicious document, payload
