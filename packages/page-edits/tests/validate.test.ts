import assert from "node:assert/strict";
import { test } from "node:test";
import { PageEditError, validatePage } from "../index";
import { obligation, profile, record } from "./fixtures";

const RECORD = "summaries/2026-09-12-invoice-cascade-parts-4471.md";
const OBLIGATION = "obligations/2026-11-15-insurance-renewal-meridian.md";

function invalid(path: string, page: string, pattern: RegExp) {
  assert.throws(
    () => validatePage(path, page),
    (error: unknown) =>
      error instanceof PageEditError && pattern.test(error.message)
  );
}

test("accepts well-formed Pages", () => {
  validatePage(RECORD, record);
  validatePage(OBLIGATION, obligation);
  validatePage("profile.md", profile);
});

test("rejects an expense block written in the body instead of the frontmatter", () => {
  const [, frontmatter, body] = record.split("---\n");
  const moved = frontmatter.replace(/^expense:[\s\S]*$/m, "");
  const expense = frontmatter.slice(frontmatter.indexOf("expense:"));
  invalid(RECORD, `---\n${moved}---\n${body}\n${expense}`, /frontmatter/);
});

test("rejects frontmatter fields written into the body, such as a second frontmatter block", () => {
  invalid(
    OBLIGATION,
    `${obligation}\n---\ntitle: x\nstatus: done\ndone_on: 2026-10-14\n---\n`,
    /body/
  );
});

test("rejects a Page without frontmatter or required fields", () => {
  invalid(RECORD, "# Just a body\n", /frontmatter/);
  invalid(OBLIGATION, obligation.replace("status: active\n", ""), /status/);
});

test("rejects Allocations that do not sum to the amount", () => {
  invalid(
    RECORD,
    record.replace(
      "{ category: supplies, amount: 212.48 }",
      "{ category: supplies, amount: 200.00 }"
    ),
    /sum/
  );
});

test("rejects an Obligation without a known kind and a due date", () => {
  invalid(
    OBLIGATION,
    obligation.replace("obligation: insurance-renewal", "obligation: renewal"),
    /kind/
  );
  invalid(OBLIGATION, obligation.replace("due: 2026-11-15\n", ""), /due/);
});

test("rejects a kind that does not match the Page's folder", () => {
  invalid(
    OBLIGATION,
    obligation.replace("kind: obligation", "kind: summary"),
    /kind/
  );
});

test("rejects body text written inside the frontmatter, such as a section heading", () => {
  invalid(
    RECORD,
    record.replace(
      "flags: []\n",
      "flags: []\n\n## Also seen in\n\n- 2026-09-12-invoice-cascade-parts-4471-2: duplicate\n"
    ),
    /## Also seen in/
  );
});

test("rejects a Profile or Obligation fact line without a Citation", () => {
  invalid(
    OBLIGATION,
    obligation.replace(
      "- **Status**: active",
      "- **Description**: renew before expiry\n- **Status**: active"
    ),
    /Citation.*Description/
  );
  invalid(
    "profile.md",
    profile.replace(" (src: 2025-04-01-lease-harborview)", ""),
    /Citation.*Premises suite/
  );
});

test("accepts uncited lines that state no Source fact: Status, links to Pages, not in the wiki, History", () => {
  validatePage(
    OBLIGATION,
    obligation.replace(
      "- **Status**: active",
      "- **Kind**: insurance-renewal, recurs yearly\n- **Record**: [certificate](../summaries/2025-11-15-insurance-cert-meridian.md)\n- **Status**: active"
    )
  );
});

const index = `---
title: Index
kind: index
sources: []
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Index

## Profile

- [Northwind Repair LLC](profile.md): the Business.

## Obligations

- 2026-11-15 insurance-renewal (active): [Insurance renewal](${OBLIGATION})

## Sources

- 2026-09-12 invoice: [Invoice 4471](${RECORD}): parts.
`;

test("accepts a well-formed Index", () => {
  validatePage("index.md", index);
});

test("rejects an Index with a section twice, sections out of order, or a Page listed twice", () => {
  invalid(
    "index.md",
    `${index}\n## Obligations\n`,
    /"Obligations" more than once/
  );
  invalid(
    "index.md",
    index
      .replace("## Profile", "## Tmp")
      .replace("## Sources", "## Profile")
      .replace("## Tmp", "## Sources"),
    /order Profile, Obligations, Entities, Expense ledgers, Sources/
  );
  invalid(
    "index.md",
    `${index}- 2026-09-12 invoice: [Invoice 4471](${RECORD}): again.\n`,
    /lists summaries\/2026-09-12-invoice-cascade-parts-4471\.md 2 times/
  );
});

test("rejects an Index Source line that does not start with the document date and kind", () => {
  invalid(
    "index.md",
    index.replace("- 2026-09-12 invoice: [Invoice 4471]", "- [Invoice 4471]"),
    /must start with its date and kind/
  );
});

test("rejects urgency stored in a Page body; the Log and Schema may name it", () => {
  for (const phrase of ["missed", "due soon", "days out"])
    invalid(RECORD, `${record}- Note: ${phrase}\n`, new RegExp(`"${phrase}"`));
  validatePage(
    "log.md",
    index
      .replace("kind: index", "kind: log")
      .replace("## Profile", "- 2026-10-17 LINT: 1 missed")
  );
});

test("rejects an Allocation category outside the Schema's closed list", () => {
  invalid(
    RECORD,
    record.replace(
      "{ category: supplies, amount: 212.48 }",
      "{ category: licenses, amount: 212.48 }"
    ),
    /category "licenses"/
  );
});

test("rejects a Ledger for a category outside the Schema's closed list", () => {
  const ledger = `---
title: Licenses
kind: ledger
sources: []
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
category: licenses
---

# Licenses
`;
  invalid("expenses/licenses.md", ledger, /category "licenses"/);
  validatePage(
    "expenses/other.md",
    ledger.replace("category: licenses", "category: other")
  );
});

const LEASE = "obligations/2026-12-31-lease-notice-harborview-properties.md";
const leaseNotice = (due: string, computed: string) => `---
title: Lease non-renewal notice due ${due}
kind: obligation
obligation: lease-notice
due: ${due}
counterparty: harborview-properties
recurs: none
sources: [2025-04-01-lease-harborview]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Lease non-renewal notice

- **Deadline**: ${computed} (src: 2025-04-01-lease-harborview)
`;

test("accepts a lease notice due the stated number of calendar days before the term ends", () => {
  validatePage(
    LEASE,
    leaseNotice("2026-12-31", "90 days before the term ends on 2027-03-31")
  );
  validatePage(
    LEASE,
    leaseNotice("2026-12-31", "computed as 2027-03-31 minus 90 days")
  );
});

test("rejects a lease notice whose due date is not the counted day, naming the right one", () => {
  invalid(
    LEASE,
    leaseNotice(
      "2027-01-01",
      "90 days before lease term end; computed as 2027-03-31 minus 90 days = 2027-01-01"
    ),
    /90 calendar days before 2027-03-31 is 2026-12-31/
  );
});

test("rejects a lease notice that does not say how its due date was computed", () => {
  invalid(
    LEASE,
    leaseNotice("2026-12-31", "Give notice of non-renewal"),
    /how/
  );
});

test("an Also seen in section lists at least one Source, once per Page", () => {
  const seen =
    "- 2026-09-30-bank-statement-tidewater (corroborates payment) (src: 2026-09-30-bank-statement-tidewater)";
  validatePage(RECORD, `${record}\n## Also seen in\n\n${seen}\n`);
  invalid(RECORD, `${record}\n## Also seen in\n\nNone.\n`, /Also seen in/);
  invalid(RECORD, `${record}\n## Also seen in\n`, /Also seen in/);
  invalid(
    RECORD,
    `${record}\n## Also seen in\n\nNone.\n\n## Also seen in\n\n${seen}\n`,
    /Also seen in/
  );
});

test("rejects an Obligation due on or before the date of the document that states it", () => {
  invalid(
    OBLIGATION,
    obligation.replace("due: 2026-11-15", "due: 2025-11-15"),
    /due after/
  );
  invalid(
    OBLIGATION,
    obligation.replace("due: 2026-11-15", "due: 2025-10-01"),
    /due after/
  );
});

const BLOCK_PAYMENT =
  "  payment:\n    status: unknown\n    due: 2026-10-12\n    evidence: []\n";

test("rejects an expense written as an inline mapping: the Schema's form is a block", () => {
  const expense = /^expense:[\s\S]*?(?=^---)/m.exec(record)![0];
  const inline = record.replace(
    expense,
    'expense: { vendor: cascade-appliance-parts, date: 2026-09-12, amount: 212.48, currency: USD, document: "4471", allocations: [{ category: supplies, amount: 212.48 }], payment: { status: paid, due: 2026-10-12, evidence: [] } }\n'
  );
  invalid(RECORD, inline, /expense.*block/);
});

test("rejects a payment written as a flow mapping or an alias", () => {
  invalid(
    RECORD,
    record.replace(
      BLOCK_PAYMENT,
      "  payment: { status: unknown, due: 2026-10-12, evidence: [] }\n"
    ),
    /payment.*block/
  );
  invalid(
    RECORD,
    record
      .replace(BLOCK_PAYMENT, "  payment: *p\n")
      .replace(
        "flags: []\n",
        "flags: []\nnote: &p { status: unknown, due: 2026-10-12, evidence: [] }\n"
      ),
    /payment.*block/
  );
});

test("rejects frontmatter that is not valid YAML", () => {
  invalid(
    RECORD,
    record.replace("flags: []", "flags: [needs-owner"),
    /not valid YAML/
  );
});
