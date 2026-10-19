import assert from "node:assert/strict";
import { test } from "node:test";
import { appendLine } from "../pages";

const HEADER = "# Log\n\nAppend only, newest at the bottom.\n";
const LINE = "- 2026-10-17 LINT: 0 conflicts";

test("the first entry of an empty Log is set off from the header by a blank line", () => {
  assert.equal(appendLine(HEADER, LINE), `${HEADER}\n${LINE}\n`);
});

test("later entries follow the previous one directly", () => {
  const first = "- 2026-10-17 INGEST [x]: done";
  assert.equal(
    appendLine(`${HEADER}\n${first}\n`, LINE),
    `${HEADER}\n${first}\n${LINE}\n`
  );
});
