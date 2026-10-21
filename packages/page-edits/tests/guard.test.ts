import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { EstablishedFactError, guardPageEdit } from "../index";
import { obligation, profile, record } from "./fixtures";

const RECORD = "summaries/2026-09-12-invoice-cascade-parts-4471.md";
const OBLIGATION = "obligations/2026-11-15-insurance-renewal-meridian.md";

const edit = (body: string, from: string, to: string) => {
  assert.ok(body.includes(from), `fixture lacks ${from}`);
  return body.replace(from, to);
};

function rejects(path: string, before: string, after: string) {
  assert.throws(
    () => guardPageEdit(path, before, after),
    (error: unknown) =>
      error instanceof EstablishedFactError &&
      error.message.includes("change_fact")
  );
}

test("rejects a change to a Record's payment status, naming change_fact", () => {
  rejects(RECORD, record, edit(record, "status: unknown", "status: paid"));
});

test("allows any other edit to a Record, such as Also seen in and flags", () => {
  const after = edit(
    edit(record, "flags: []", "flags: [needs-owner]"),
    "- Payment: unknown",
    "- Payment: unknown, pending Approval\n\n## Also seen in\n\n- `x-2`: duplicate"
  );
  guardPageEdit(RECORD, record, after);
});

test("rejects removing a Record's payment block", () => {
  const block =
    "  payment:\n    status: unknown\n    due: 2026-10-12\n    evidence: []\n";
  rejects(RECORD, record, edit(record, block, ""));
});

test("rejects adding payment evidence to a Record", () => {
  rejects(RECORD, record, edit(record, "evidence: []", "evidence: [x-2]"));
});

test("allows writing a payment block for the first time", () => {
  const block =
    "  payment:\n    status: unknown\n    due: 2026-10-12\n    evidence: []\n";
  guardPageEdit(RECORD, edit(record, block, ""), record);
});

test("rejects marking an Obligation done or superseded in frontmatter", () => {
  rejects(
    OBLIGATION,
    obligation,
    edit(obligation, "status: active", "status: done\ndone_on: 2026-10-14")
  );
  rejects(
    OBLIGATION,
    obligation,
    edit(
      obligation,
      "status: active",
      "status: superseded\nsuperseded_by: obligations/x.md"
    )
  );
  rejects(
    OBLIGATION,
    obligation,
    edit(obligation, "due: 2026-11-15", "due: 2027-11-15")
  );
});

test("rejects changing or removing an Obligation fact line", () => {
  rejects(
    OBLIGATION,
    obligation,
    edit(obligation, "- **Status**: active", "- **Status**: done")
  );
  rejects(
    OBLIGATION,
    obligation,
    edit(
      obligation,
      "- **Due**: 2026-11-15 (src: 2025-11-15-insurance-cert-meridian)\n",
      ""
    )
  );
});

test("rejects changing a Profile fact line", () => {
  rejects("profile.md", profile, edit(profile, "88-1234567", "88-7654321"));
});

test("allows adding a new Profile fact and filling a not-in-the-wiki line", () => {
  const after = edit(
    edit(
      profile,
      "- **State of formation**: not in the wiki (Articles of Organization not yet ingested)",
      "- **State of formation**: Oregon (src: 2024-10-09-articles-of-organization)"
    ),
    "## Addresses\n",
    "## Addresses\n\n- **Mailing address**: PO Box 12 (src: 2024-10-21-ein-letter)\n"
  );
  guardPageEdit("profile.md", profile, after);
});

test("allows recording a Contradiction that keeps the first recorded value and its Citation", () => {
  const after = edit(
    edit(profile, "flags: []", "flags: [conflict]"),
    "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
    "- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-18: Suite 210 (src: 2025-04-01-lease-harborview) or Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)\n  - First recorded: Suite 210 from the lease on 2026-10-17. Resolving needs Approval."
  );
  guardPageEdit("profile.md", profile, after);
});

test("rejects a Contradiction that drops the first recorded value", () => {
  rejects(
    "profile.md",
    profile,
    edit(
      profile,
      "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
      "- **Premises suite**: ⚠ **Conflict**: Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)"
    )
  );
});

test("rejects a Contradiction that keeps the first value's numbers and Citation but trims its wording", () => {
  const before = edit(
    profile,
    "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
    "- **Premises suite**: 1480 Harbor Avenue, Suite 210, Portside (src: 2025-04-01-lease-harborview)"
  );
  const after = edit(
    before,
    "- **Premises suite**: 1480 Harbor Avenue, Suite 210, Portside (src: 2025-04-01-lease-harborview)",
    "- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-17: 1480 Harbor Avenue, Suite 210 (src: 2025-04-01-lease-harborview) or 1480 Harbor Avenue, Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)"
  );
  rejects("profile.md", before, after);
});

test("accepts a Contradiction that keeps the first claim whole, whitespace aside", () => {
  const after = edit(
    profile,
    "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
    "- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-17: Suite  210  (src: 2025-04-01-lease-harborview)  or Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)."
  );
  guardPageEdit("profile.md", profile, after);
});

test("every Contradiction in the base and full fixtures is admitted from its first recorded claim", () => {
  const conflicts = ["base", "full"].flatMap((wiki) =>
    fixture(wiki, "profile.md")
      .split("\n")
      .filter((line) => line.includes("**Conflict**"))
      .map((line) => ({ wiki, line }))
  );
  assert.ok(conflicts.length >= 2, "the fixtures carry the Contradictions");
  for (const { wiki, line } of conflicts) {
    const after = fixture(wiki, "profile.md");
    const [, label, first] =
      /^- (\*\*[^*]+\*\*): ⚠ \*\*Conflict\*\*[^:]*: (.+?\(src: [^)]+\)) or /.exec(
        line
      ) ?? [];
    assert.ok(first, `cannot read the first claim of ${line}`);
    const before = edit(after, line, `- ${label}: ${first}`);
    guardPageEdit("profile.md", before, after);
  }
});

test("an existing Conflict may gain a claim but not lose one", () => {
  const conflict =
    "- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-17: Suite 210 (src: 2025-04-01-lease-harborview) or Suite 201 (src: 2025-11-15-insurance-cert-meridian)";
  const before = edit(
    profile,
    "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
    conflict
  );
  guardPageEdit(
    "profile.md",
    before,
    edit(
      before,
      conflict,
      `${conflict} or Suite 212 (src: 2026-03-02-insurance-cert-meridian-bayview)`
    )
  );
  rejects(
    "profile.md",
    before,
    edit(
      before,
      conflict,
      "- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-17: Suite 210 (src: 2025-04-01-lease-harborview) or Suite 212 (src: 2026-03-02-insurance-cert-meridian-bayview)"
    )
  );
});

test("rejects a Contradiction that changes the first value's number", () => {
  rejects(
    "profile.md",
    profile,
    edit(
      profile,
      "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
      "- **Premises suite**: ⚠ **Conflict**, unresolved since 2026-10-17: Suite 211 (src: 2025-04-01-lease-harborview) or Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)"
    )
  );
});

test("the refusal explains how to record a Contradiction without Approval", () => {
  assert.throws(
    () =>
      guardPageEdit(
        "profile.md",
        profile,
        edit(profile, "Suite 210 (src", "Suite 201 (src")
      ),
    /Contradiction.*Conflict/
  );
});

test("a Conflict that trims the first claim is refused with the exact claim to keep", () => {
  const original =
    "1480 Harbor Avenue, Suite 210, Portside (src: 2025-04-01-lease-harborview)";
  const before = edit(
    profile,
    "- **Premises suite**: Suite 210 (src: 2025-04-01-lease-harborview)",
    `- **Premises address**: ${original}`
  );
  assert.throws(
    () =>
      guardPageEdit(
        "profile.md",
        before,
        edit(
          before,
          `- **Premises address**: ${original}`,
          "- **Premises address**: ⚠ **Conflict**, unresolved since 2026-10-17: 1480 Harbor Avenue, Suite 210 (src: 2025-04-01-lease-harborview) or 1480 Harbor Ave, Suite 201 (src: 2026-03-02-insurance-cert-meridian-bayview)"
        )
      ),
    (error: unknown) =>
      error instanceof EstablishedFactError &&
      error.message.includes(
        `\`- **Premises address**: ⚠ **Conflict**, unresolved since <Demo Date>: ${original} or <new value> (src: <new source>)\``
      )
  );
});

test("protects Profile and Obligation Pages by path even if kind is edited", () => {
  const relabel = (body: string, kind: string) =>
    edit(body, `kind: ${kind}`, "kind: summary");
  rejects(
    "profile.md",
    profile,
    relabel(edit(profile, "88-1234567", "x"), "profile")
  );
  rejects(
    OBLIGATION,
    obligation,
    relabel(edit(obligation, "status: active", "status: done"), "obligation")
  );
});

test("allows new lines on an Obligation, such as History and Related", () => {
  const after = edit(
    obligation,
    "- 2026-10-17 created from the certificate summary\n",
    "- 2026-10-17 created from the certificate summary\n- 2026-10-18 renewal proposed\n\n## Related\n\n- [Profile](../profile.md)\n"
  );
  guardPageEdit(
    OBLIGATION,
    obligation,
    edit(after, "flags: []", "flags: [needs-owner]")
  );
});

const BLOCK_PAYMENT =
  "  payment:\n    status: unknown\n    due: 2026-10-12\n    evidence: []\n";

/** The fixture Record with its payment block written another way. */
const withPayment = (payment: string) => edit(record, BLOCK_PAYMENT, payment);

test("rejects a payment status change in an inline expense mapping", () => {
  const inline = (status: string) =>
    edit(
      edit(record, /^expense:[\s\S]*?(?=^---)/m.exec(record)![0], ""),
      "flags: []\n",
      `flags: []\nexpense: { vendor: cascade-appliance-parts, date: 2026-09-12, amount: 212.48, currency: USD, document: "4471", allocations: [{ category: supplies, amount: 212.48 }], payment: { status: ${status}, due: 2026-10-12, evidence: [] } }\n`
    );
  rejects(RECORD, inline("unknown"), inline("paid"));
});

test("rejects a payment status change in a flow-style payment mapping", () => {
  const flow = (status: string) =>
    withPayment(
      `  payment: { status: ${status}, due: 2026-10-12, evidence: [] }\n`
    );
  rejects(RECORD, flow("unknown"), flow("paid"));
});

test("rejects a payment status change under quoted keys", () => {
  const quoted = (status: string) =>
    withPayment(
      `  "payment":\n    'status': ${status}\n    due: 2026-10-12\n    evidence: []\n`
    );
  rejects(RECORD, quoted("unknown"), quoted("paid"));
});

test("rejects a payment status change made through an anchor the payment aliases", () => {
  const aliased = (status: string) =>
    edit(
      withPayment("  payment: *p\n"),
      "flags: []\n",
      `flags: []\nnote: &p { status: ${status}, due: 2026-10-12, evidence: [] }\n`
    );
  rejects(RECORD, aliased("unknown"), aliased("paid"));
});

test("rejects an edit that leaves a Record's payment unreadable as YAML", () => {
  rejects(RECORD, record, edit(record, "flags: []", "flags: [needs-owner"));
});

test("rejects rewriting a block payment as an inline mapping that marks it paid", () => {
  rejects(
    RECORD,
    record,
    withPayment("  payment: { status: paid, due: 2026-10-12, evidence: [] }\n")
  );
});

const fixture = (wiki: string, name: string) =>
  readFileSync(join(__dirname, "../../../fixtures", wiki, name), "utf8");

const EIN = "- **EIN**: 88-1234567 (src: 2024-10-21-ein-letter)";

test("rejects changing a current fact while moving the original line into History", () => {
  const before = fixture("full", "profile.md");
  const after = `${edit(before, EIN, EIN.replace("88-1234567", "99-7654321"))}\n## History\n\n${EIN}\n`;
  rejects("profile.md", before, after);
});

test("rejects a Conflict that replaces a Profile fact while keeping only its numbers and Citation", () => {
  const before = fixture("full", "profile.md");
  const after = edit(
    before,
    "- **Member (operating agreement)**: Sam Rivera (sole Member; 100% membership interest) (src: 2024-10-10-operating-agreement)",
    "- **Member (operating agreement)**: ⚠ **Conflict**, unresolved since 2026-10-18: Alex Smith, 100% (src: 2024-10-10-operating-agreement) or Chris Jones (src: 2026-03-02-insurance-cert-meridian-bayview)"
  );
  rejects("profile.md", before, after);
});

const FULL = () => fixture("full", "profile.md");
const NEW_EIN = EIN.replace("88-1234567", "99-7654321");

test("rejects moving a fact line into another section, changed or not", () => {
  const before = FULL();
  const moved = (line: string) =>
    edit(
      edit(before, `${EIN}\n`, ""),
      "## Addresses\n",
      `## Addresses\n\n${line}\n`
    );
  rejects("profile.md", before, moved(EIN));
  rejects(
    "profile.md",
    before,
    edit(
      moved(EIN),
      "- **Date business started",
      `${NEW_EIN}\n- **Date business started`
    )
  );
});

test("rejects a second line for a label that competes with its fact", () => {
  const before = FULL();
  rejects("profile.md", before, edit(before, EIN, `${EIN}\n${NEW_EIN}`));
  rejects("profile.md", before, edit(before, EIN, `${NEW_EIN}\n${EIN}`));
});

test("allows a second line restating a fact's value from another Source", () => {
  const before = FULL();
  guardPageEdit(
    "profile.md",
    before,
    edit(
      before,
      EIN,
      `${EIN}\n- **EIN**: 88-1234567 (src: 2026-02-20-w9-northwind)`
    )
  );
});

test("allows copying a fact into History while the current line stays", () => {
  const before = FULL();
  guardPageEdit(
    "profile.md",
    before,
    `${before}\n## History\n\n${EIN}\n- 2026-10-18 EIN confirmed\n`
  );
});

test("allows reordering fact lines within a section and reordering sections", () => {
  const before = FULL();
  const identity =
    "- **Legal name (EIN letter)**: NORTHWIND REPAIR LLC (src: 2024-10-21-ein-letter)";
  const swapped = edit(
    edit(before, `${identity}\n`, ""),
    `${EIN}\n`,
    `${EIN}\n${identity}\n`
  );
  guardPageEdit("profile.md", before, swapped);
  const banking = /## Banking\n[\s\S]*?(?=\n## )/.exec(before)![0];
  const moved = edit(
    edit(before, banking, ""),
    "## Identity",
    `${banking}\n\n## Identity`
  );
  guardPageEdit("profile.md", before, moved);
});

test("rejects renaming a fact's label, in case, wording, or spacing", () => {
  const before = FULL();
  for (const label of [
    "- **Ein**:",
    "- **EIN (EIN letter)**:",
    "- **EIN** :",
    "- ** EIN**:",
  ])
    rejects("profile.md", before, edit(before, "- **EIN**:", label));
  rejects(
    "profile.md",
    before,
    edit(before, EIN, EIN.replace(": 88", ":  88"))
  );
});

test("rejects renaming the section that holds a fact but allows renaming the Page title", () => {
  const before = FULL();
  rejects(
    "profile.md",
    before,
    edit(before, "## Identity", "## Identity and tax")
  );
  rejects("profile.md", before, edit(before, "## Identity", "### Identity"));
  guardPageEdit(
    "profile.md",
    before,
    edit(before, "# Northwind Repair LLC", "# Northwind Repair")
  );
});

test("a fact is held by its label within its section: the same label elsewhere is another fact", () => {
  const identity = "- **EIN**: 88-1234567 (src: 2024-10-21-ein-letter)";
  const addresses = "- **EIN**: 77-0000000 (src: 2026-02-20-w9-northwind)";
  const before = edit(
    profile,
    "## Addresses\n",
    `## Addresses\n\n${addresses}\n`
  );
  rejects("profile.md", before, edit(before, identity, addresses));
  rejects(
    "profile.md",
    before,
    edit(
      edit(edit(before, identity, "@@"), addresses, identity),
      "@@",
      addresses
    )
  );
  guardPageEdit("profile.md", before, before);
});

test("rejects a Conflict for a fact written under another section", () => {
  const before = FULL();
  const conflict =
    "- **EIN**: ⚠ **Conflict**, unresolved since 2026-10-18: 88-1234567 (src: 2024-10-21-ein-letter) or 99-7654321 (src: 2026-02-20-w9-northwind)";
  rejects(
    "profile.md",
    before,
    edit(
      edit(before, `${EIN}\n`, ""),
      "## Addresses\n",
      `## Addresses\n\n${conflict}\n`
    )
  );
  guardPageEdit("profile.md", before, edit(before, EIN, conflict));
});

test("rejects a Conflict that drops a claim of a Conflict already on the Page", () => {
  const before = FULL();
  const line = before
    .split("\n")
    .find((l) => l.startsWith("- **Principal office**:"))!;
  const dropped = line.replace(
    " or 1480 Harbor Ave, Suite 201, Portside (src: 2026-03-02-insurance-cert-meridian-bayview)",
    " or Suite 999 (src: 2026-10-14-insurance-cert-meridian-renewal)"
  );
  assert.notEqual(dropped, line);
  rejects("profile.md", before, edit(before, line, dropped));
  rejects("profile.md", before, edit(before, line, `${line}\n${dropped}`));
});

test("a value that merely mentions 'not in the wiki' is not a placeholder", () => {
  const before = edit(
    profile,
    "(src: 2024-10-21-ein-letter)",
    "(src: 2024-10-21-ein-letter); W-9 not in the wiki yet"
  );
  rejects("profile.md", before, edit(before, "88-1234567", "99-7654321"));
});

test("rejects moving an Obligation fact line into its History", () => {
  const due = "- **Due**: 2026-11-15 (src: 2025-11-15-insurance-cert-meridian)";
  rejects(
    OBLIGATION,
    obligation,
    edit(
      edit(obligation, due, due.replace("2026-11-15", "2027-11-15")),
      "## History\n",
      `## History\n\n${due}\n`
    )
  );
  rejects(
    OBLIGATION,
    obligation,
    edit(obligation, "- 2026-10-17 created from the certificate summary\n", "")
  );
});

test("every fixture Profile and Obligation Page passes its own guard, unchanged and with a section appended", () => {
  const pages = ["base", "full", "prototype", "empty"].flatMap((wiki) => {
    const root = join(__dirname, "../../../fixtures", wiki);
    const obligations = existsSync(join(root, "obligations"))
      ? readdirSync(join(root, "obligations")).map((f) => `obligations/${f}`)
      : [];
    return ["profile.md", ...obligations].map((path) => ({
      path,
      body: readFileSync(join(root, path), "utf8"),
    }));
  });
  assert.ok(pages.length > 20);
  for (const { path, body } of pages) {
    guardPageEdit(path, body, body);
    guardPageEdit(path, body, `${body}\n## Related\n\n- [Index](index.md)\n`);
  }
});

test("the refusal of a second line for a label offers its own label or a Conflict", () => {
  const before = FULL();
  assert.throws(
    () =>
      guardPageEdit(
        "profile.md",
        before,
        edit(before, EIN, `${EIN}\n${NEW_EIN}`)
      ),
    (error: unknown) =>
      error instanceof EstablishedFactError &&
      error.message.includes("its own label") &&
      error.message.includes(
        "`- **EIN**: ⚠ **Conflict**, unresolved since <Demo Date>: 88-1234567 (src: 2024-10-21-ein-letter) or <new value>"
      )
  );
});
