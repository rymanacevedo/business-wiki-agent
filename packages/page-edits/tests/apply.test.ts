import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, PageEditError } from "../index";
import { record } from "./fixtures";

test("replaces each exact find with its replacement", () => {
  const page = "# A\n\n- one\n- two\n";
  assert.equal(
    applyEdits(page, [
      { find: "- one", replace: "- uno" },
      { find: "- two\n", replace: "- two\n- three\n" },
    ]),
    "# A\n\n- uno\n- two\n- three\n"
  );
});

test("rejects a find that is missing or matches more than once", () => {
  assert.throws(
    () => applyEdits("- a\n- a\n", [{ find: "- a", replace: "- b" }]),
    (error: unknown) =>
      error instanceof PageEditError && /2 times/.test(error.message)
  );
  assert.throws(
    () => applyEdits("- a\n", [{ find: "- z", replace: "- b" }]),
    (error: unknown) =>
      error instanceof PageEditError && /not found/.test(error.message)
  );
});

test("matches a multi-line find whose indentation differs, keeping the Page's indentation", () => {
  const after = applyEdits(record, [
    {
      find: "payment:\n  status: unknown\n  due: 2026-10-12\n  evidence: []",
      replace: "payment:\n  status: paid\n  due: 2026-10-12\n  evidence: [x-2]",
    },
  ]);
  assert.ok(
    after.includes(
      "  payment:\n    status: paid\n    due: 2026-10-12\n    evidence: [x-2]\n---"
    ),
    after
  );
});

test("an empty find appends the replacement at the end of the Page", () => {
  assert.equal(
    applyEdits("# A\n", [{ find: "", replace: "\n## Also seen in\n\n- x\n" }]),
    "# A\n\n## Also seen in\n\n- x\n"
  );
});
