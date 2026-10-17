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
A categorized receipt or invoice in the Wiki: vendor, amount, date, and category, citing its Source.
_Avoid_: Receipt page, transaction, expense, line item

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
The Owner's explicit yes, requested before Clerk changes an established fact on the Profile or an Obligation Page, or overwrites one side of a contradiction.
_Avoid_: Confirmation, permission, sign-off, consent

**Citation**:
A reference from a Page or an answer back to the Source or Page it came from.
_Avoid_: Reference, link, footnote
