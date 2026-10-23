import assert from "node:assert/strict";
import { test } from "node:test";
import { pagePath } from "../pages";

// Every write tool takes its Page path through pagePath: the retrieval cache
// under cache/ lives in the same namespace but is never a Page.

test("a Page path is normalised and kept", () => {
  assert.equal(pagePath(" /wiki/entities/acme.md "), "entities/acme.md");
});

test("no model-supplied path reaches the retrieval cache", () => {
  for (const path of [
    "cache/embeddings.json",
    "cache/embeddings.md",
    "/wiki/cache/notes.md",
    "Cache/notes.md",
  ])
    assert.throws(() => pagePath(path), /not a Page/, path);
});
