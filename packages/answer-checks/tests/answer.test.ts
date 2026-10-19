import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAnswer, type Check } from "../index";

const failed = (checks: Check[]) =>
  checks.filter((c) => !c.passed).map((c) => c.name);

// A Query answer in the shape the agent instructions ask for.
const EIN_ANSWER =
  "Northwind Repair LLC's EIN is 88-1234567 (src: 2024-10-21-ein-letter), " +
  "on the [Northwind Repair LLC](/wiki/profile.md) Profile.";

test("an answer with every required value, no forbidden text, and its Citations passes", () => {
  const checks = checkAnswer(
    {
      must_include: ["88-1234567"],
      must_not_include: ["I think"],
      cites: ["profile.md", "2024-10-21-ein-letter"],
    },
    EIN_ANSWER
  );

  assert.deepEqual(
    checks.map((c) => c.name),
    [
      "includes 88-1234567",
      "excludes I think",
      "cites profile.md",
      "cites 2024-10-21-ein-letter",
    ]
  );
  assert.deepEqual(failed(checks), []);
});

test("a missing value, a forbidden phrase, or a missing Citation each fails its own check", () => {
  const checks = checkAnswer(
    {
      must_include: ["88-7654321"],
      must_not_include: ["northwind repair"],
      cites: ["obligations/2026-11-15-"],
    },
    EIN_ANSWER
  );

  assert.deepEqual(failed(checks), [
    "includes 88-7654321",
    "excludes northwind repair",
    "cites obligations/2026-11-15-",
  ]);
});

test("a `/re/flags` pattern is a regular expression and a list matches any of its patterns", () => {
  const ssn = {
    must_include: [["***-**-6789", "/x{3}-x{2}-6789/i"]],
    must_not_include: ["/\\b\\d{3}-\\d{2}-\\d{4}\\b/"],
  };

  assert.deepEqual(
    failed(checkAnswer(ssn, "Sam's SSN on file is XXX-XX-6789.")),
    []
  );
  assert.deepEqual(failed(checkAnswer(ssn, "Sam's SSN is 123-45-6789.")), [
    "includes ***-**-6789 | /x{3}-x{2}-6789/i",
    "excludes /\\b\\d{3}-\\d{2}-\\d{4}\\b/",
  ]);
});

test("a failed exclusion says what it found", () => {
  const [check] = checkAnswer(
    { must_not_include: ["/\\d/"] },
    "That isn't in the wiki. A Form 941 would show it."
  );

  assert.equal(check?.passed, false);
  assert.equal(check?.detail, 'found "9"');
});
