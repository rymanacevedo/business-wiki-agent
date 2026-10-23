import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval } from "../index";
import { fullWiki } from "./full-wiki";

let store: WikiStore;
let cleanup = () => {};
beforeEach(async () => {
  ({ store, cleanup } = await fullWiki());
});
afterEach(() => cleanup());

test("flagged lists every Page carrying the flag, sorted by path", async () => {
  const retrieval = createRetrieval({ store });
  assert.deepEqual(await retrieval.flagged("conflict"), [
    { path: "profile.md", kind: "profile", status: "active" },
  ]);
  assert.deepEqual(await retrieval.flagged("suspicious-content"), [
    {
      path: "summaries/2026-10-02-invoice-eastside-auto-3381.md",
      kind: "summary",
      status: "active",
    },
  ]);
  assert.deepEqual(await retrieval.flagged("needs-owner"), []);
});

test("flagged sees a flag added since the last call, in either YAML list style", async () => {
  const retrieval = createRetrieval({ store });
  await retrieval.flagged("needs-owner");
  await store.write(
    "entities/zeta.md",
    "---\ntitle: Zeta\nkind: entity\nstatus: active\nflags:\n  - needs-owner\n  - conflict\n---\n\nZETA\n",
    { etag: null }
  );
  await store.write(
    "entities/alpha.md",
    "---\ntitle: Alpha\nkind: entity\nstatus: active\nflags: [needs-owner]\n---\n\nALPHA\n",
    { etag: null }
  );
  assert.deepEqual(
    (await retrieval.flagged("needs-owner")).map((p) => p.path),
    ["entities/alpha.md", "entities/zeta.md"]
  );
});

test("flagged reads past YAML comments", async () => {
  const retrieval = createRetrieval({ store });
  await store.write(
    "entities/inline.md",
    "---\ntitle: Inline\nkind: entity\nstatus: active\nflags: [needs-owner] # set by Lint\n---\n\nINLINE\n",
    { etag: null }
  );
  await store.write(
    "entities/block.md",
    "---\ntitle: Block\nkind: entity\nstatus: active\nflags:\n  # set by Lint\n  - needs-owner # why\n---\n\nBLOCK\n",
    { etag: null }
  );
  assert.deepEqual(
    (await retrieval.flagged("needs-owner")).map((p) => p.path),
    ["entities/block.md", "entities/inline.md"]
  );
});
