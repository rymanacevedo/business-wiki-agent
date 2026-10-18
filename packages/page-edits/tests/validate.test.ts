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
