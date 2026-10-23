import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval } from "../index";
import { fullWiki } from "./full-wiki";

/** The store, counting manifests and reads and the most reads in flight at once. */
function counting(store: WikiStore) {
  const stats = { manifests: 0, reads: [] as string[], inFlight: 0, peak: 0 };
  const wrapped: WikiStore = {
    ...store,
    async manifest(prefix) {
      stats.manifests++;
      return store.manifest(prefix);
    },
    async read(path) {
      stats.reads.push(path);
      stats.peak = Math.max(stats.peak, ++stats.inFlight);
      try {
        await new Promise((r) => setTimeout(r, 1));
        return await store.read(path);
      } finally {
        stats.inFlight--;
      }
    },
  };
  return { stats, store: wrapped };
}

let store: WikiStore;
let cleanup = () => {};
beforeEach(async () => {
  ({ store, cleanup } = await fullWiki());
});
afterEach(() => cleanup());

const DELI = "summaries/2026-08-22-receipt-dockside-deli.md";

test("the first search reads every Page once, 10 at most in flight; the next reads none", async () => {
  const { stats, store: wrapped } = counting(store);
  const retrieval = createRetrieval({ store: wrapped });
  await retrieval.search({ query: "cash" });
  assert.equal(stats.manifests, 1);
  assert.equal(stats.reads.length, 70);
  assert.ok(stats.peak <= 10 && stats.peak > 1, `peak ${stats.peak}`);
  assert.ok(
    !stats.reads.some((p) => p.startsWith("sources/") || p === "index.md")
  );
  stats.reads.length = 0;
  await retrieval.search({ query: "cash" });
  assert.equal(stats.manifests, 2);
  assert.deepEqual(stats.reads, []);
});

test("a Page edited through the store is searchable on the next search, and only it is re-read", async () => {
  const { stats, store: wrapped } = counting(store);
  const retrieval = createRetrieval({ store: wrapped });
  await retrieval.search({ query: "cash" });
  const page = await store.read(DELI);
  assert.ok(page);
  await store.write(
    DELI,
    page.body.replace("ICED TEA", "ICED TEA\n- ZQUORBLAT SANDWICH — 3.00"),
    { etag: page.etag }
  );
  stats.reads.length = 0;
  const result = await retrieval.search({ query: "zquorblat" });
  assert.deepEqual(stats.reads, [DELI]);
  assert.deepEqual(
    result.pages.map((p) => p.path),
    [DELI]
  );
  assert.ok(result.pages[0].excerpt?.some((l) => l.includes("ZQUORBLAT")));
});

test("a new Page is found and a deleted one is dropped", async () => {
  // The store has no delete; a Page absent from the manifest is deleted.
  const hidden = new Set<string>();
  const view: WikiStore = {
    ...store,
    async manifest(prefix) {
      return (await store.manifest(prefix)).filter((e) => !hidden.has(e.path));
    },
  };
  const retrieval = createRetrieval({ store: view });
  const query = "Dockside Deli cash zquorblat";
  const found = async () =>
    (await retrieval.search({ query })).pages.map((p) => p.path);
  assert.ok((await found()).includes(DELI));
  hidden.add(DELI);
  assert.ok(!(await found()).includes(DELI));
  await store.write(
    "entities/zquorblat-co.md",
    "---\ntitle: Zquorblat Co\nkind: entity\nstatus: active\n---\n\nZQUORBLAT CO\n",
    { etag: null }
  );
  assert.ok((await found()).includes("entities/zquorblat-co.md"));
});

test("an edit seen first by flagged is still searchable afterwards", async () => {
  const retrieval = createRetrieval({ store });
  await retrieval.search({ query: "cash" });
  const page = await store.read(DELI);
  assert.ok(page);
  await store.write(DELI, `${page.body}\n- ZQUORBLAT tip\n`, {
    etag: page.etag,
  });
  await retrieval.flagged("conflict");
  assert.deepEqual(
    (await retrieval.search({ query: "zquorblat" })).pages.map((p) => p.path),
    [DELI]
  );
});

test("a refresh that fails part-way still leaves the next search current", async () => {
  // Pages read before the failure are already in the memo: the index must
  // still rebuild, even if the Page that failed is gone by the next search.
  const NEW = "entities/zz-new.md";
  const hidden = new Set<string>();
  let failNew = false;
  const view: WikiStore = {
    ...store,
    async manifest(prefix) {
      return (await store.manifest(prefix)).filter((e) => !hidden.has(e.path));
    },
    async read(path) {
      if (path === NEW && failNew) throw new Error("network");
      return store.read(path);
    },
  };
  const retrieval = createRetrieval({ store: view });
  await retrieval.search({ query: "cash" });
  const page = await store.read(DELI);
  assert.ok(page);
  await store.write(DELI, `${page.body}\n- ZQUORBLAT tip\n`, {
    etag: page.etag,
  });
  await store.write(NEW, "---\ntitle: New\nkind: entity\n---\n\nNEW\n", {
    etag: null,
  });
  failNew = true;
  await assert.rejects(retrieval.search({ query: "zquorblat" }), /network/);
  hidden.add(NEW);
  assert.deepEqual(
    (await retrieval.search({ query: "zquorblat" })).pages.map((p) => p.path),
    [DELI]
  );
});
