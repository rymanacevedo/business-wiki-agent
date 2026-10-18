import assert from "node:assert/strict";
import { test } from "node:test";
import { langsmithTarget } from "../index";

test("targets the US traces endpoint with the key and project as headers", () => {
  assert.deepEqual(
    langsmithTarget({
      LANGSMITH_API_KEY: "lsv2_key",
      LANGSMITH_PROJECT: "business-wiki-agent-local",
    }),
    {
      url: "https://api.smith.langchain.com/otel/v1/traces",
      headers: {
        "x-api-key": "lsv2_key",
        "Langsmith-Project": "business-wiki-agent-local",
      },
    }
  );
});

test("disables export when the key or the project is missing", () => {
  assert.equal(langsmithTarget({}), null);
  assert.equal(langsmithTarget({ LANGSMITH_API_KEY: "lsv2_key" }), null);
  assert.equal(
    langsmithTarget({ LANGSMITH_PROJECT: "p", LANGSMITH_API_KEY: "" }),
    null
  );
});

test("uses LANGSMITH_ENDPOINT for the EU host", () => {
  const eu = langsmithTarget({
    LANGSMITH_API_KEY: "k",
    LANGSMITH_PROJECT: "p",
    LANGSMITH_ENDPOINT: "https://eu.api.smith.langchain.com/",
  });
  assert.equal(eu?.url, "https://eu.api.smith.langchain.com/otel/v1/traces");
});

test("an eval run traces to the evals project", () => {
  const evals = langsmithTarget({
    LANGSMITH_API_KEY: "k",
    LANGSMITH_PROJECT: "business-wiki-agent-local",
    EVAL_RUN_LABEL: "before",
  });
  assert.equal(
    evals?.headers["Langsmith-Project"],
    "business-wiki-agent-evals"
  );
});

test("LANGSMITH_EVAL_PROJECT overrides the evals project", () => {
  const evals = langsmithTarget({
    LANGSMITH_API_KEY: "k",
    LANGSMITH_PROJECT: "business-wiki-agent-local",
    LANGSMITH_EVAL_PROJECT: "scratch-evals",
    EVAL_RUN_LABEL: "before",
  });
  assert.equal(evals?.headers["Langsmith-Project"], "scratch-evals");
});
