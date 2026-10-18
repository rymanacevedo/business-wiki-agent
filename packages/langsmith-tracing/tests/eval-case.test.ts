import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVAL_CASE_HEADER,
  evalCaseContext,
  withEvalCase,
  type SessionAuth,
} from "../index";

const localDev: SessionAuth & Record<string, unknown> = {
  attributes: {},
  authenticator: "local-dev",
  principalId: "local-dev",
  principalType: "local-dev",
};

test("an eval request's case id header becomes a session auth attribute", () => {
  const headers = new Headers({ [EVAL_CASE_HEADER]: "query-ein-01" });
  const auth = withEvalCase(localDev, headers);
  assert.equal(auth?.attributes["eval.case_id"], "query-ein-01");
  assert.equal(auth?.principalId, "local-dev");
});

test("requests without a usable case id keep their auth unchanged", () => {
  assert.equal(withEvalCase(localDev, new Headers()), localDev);
  const junk = new Headers({ [EVAL_CASE_HEADER]: "<script>" });
  assert.equal(withEvalCase(localDev, junk), localDev);
  const any = new Headers({ [EVAL_CASE_HEADER]: "query-ein-01" });
  assert.equal(withEvalCase(null, any), null);
});

test("the session's case id becomes runtime context for its spans", () => {
  const tagged = { ...localDev, attributes: { "eval.case_id": "ingest-07" } };
  assert.deepEqual(
    evalCaseContext({ auth: { current: localDev, initiator: tagged } }),
    { "eval.case_id": "ingest-07" }
  );
  assert.equal(
    evalCaseContext({ auth: { current: localDev, initiator: localDev } }),
    undefined
  );
  assert.equal(
    evalCaseContext({ auth: { current: null, initiator: null } }),
    undefined
  );
});
