import assert from "node:assert/strict";
import { test } from "node:test";
import agent from "../../agent";

// The session cost cap (spec #15: a unit test, not an eval row; an eval
// cannot provoke it deterministically). The per-session caps are the open
// demo's only abuse mitigation: eve stops a session from starting another
// model call once either is reached, until the Owner chooses Continue.

const limits = (agent as { limits?: Record<string, unknown> }).limits ?? {};

test("every session is capped at about $1 of model token cost", () => {
  const cap = limits.maxTokenCostUsdPerSession;
  assert.equal(typeof cap, "number", "maxTokenCostUsdPerSession is unset");
  assert.ok((cap as number) > 0 && (cap as number) <= 1, `cap is $${cap}`);
});

test("every session has an input-token cap (not eve's 40M default, not uncapped)", () => {
  const cap = limits.maxInputTokensPerSession;
  assert.equal(typeof cap, "number", "maxInputTokensPerSession is unset");
  assert.ok(
    (cap as number) > 0 && (cap as number) <= 1_000_000,
    `cap is ${cap} input tokens`
  );
});
