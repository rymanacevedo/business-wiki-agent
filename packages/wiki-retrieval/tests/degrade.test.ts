import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval, renderResult } from "../index";
import { throwingEmbed } from "./fake-embed";
import { fullWiki } from "./full-wiki";

// The only test file whose searches degrade, so the per-process warning
// count is this file's to assert.

let store: WikiStore;
let cleanup = () => {};
before(async () => {
  ({ store, cleanup } = await fullWiki());
});
after(() => cleanup());

const DEGRADED =
  "Keyword matches only this time: semantic matching was unavailable.";

test("a throwing adapter: keyword Matches, Rung lexical, degraded, one trailing line, one warning per process", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const query = "Which purchases did we pay in cash?";
  const lexical = await createRetrieval({ store }).search({ query });
  const results = [];
  for (const retrieval of [
    createRetrieval({ store, embed: throwingEmbed }),
    createRetrieval({ store, embed: throwingEmbed }),
  ])
    for (let i = 0; i < 2; i++) results.push(await retrieval.search({ query }));
  for (const result of results) {
    assert.equal(result.rung, "lexical");
    assert.equal(result.degraded, true);
    assert.deepEqual(result.pages, lexical.pages);
    const text = renderResult(result);
    assert.ok(text.endsWith(`\n${DEGRADED}`), text);
    assert.equal(text, `${renderResult(lexical)}\n${DEGRADED}`);
  }
  assert.equal(warn.mock.callCount(), 1);
});

test("an adapter answering the wrong number of dimensions degrades the same way", async () => {
  const result = await createRetrieval({
    store,
    embed: async (texts) => texts.map(() => [1, 0, 0]),
  }).search({ query: "cash" });
  assert.equal(result.rung, "lexical");
  assert.equal(result.degraded, true);
});
