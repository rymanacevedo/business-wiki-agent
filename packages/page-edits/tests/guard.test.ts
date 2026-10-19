import assert from "node:assert/strict";
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

test("accepts a Contradiction that keeps the first value's numbers and Citation but trims its wording", () => {
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
  guardPageEdit("profile.md", before, after);
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
