import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { WikiConflictError, type WikiStore } from "../../wiki-store";
import {
  createRetrieval,
  EMBED_PER_SEARCH,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embedWiki,
  renderResult,
  type Embed,
} from "../index";
import { countingEmbed, fakeEmbed } from "./fake-embed";
import { BASE, FULL, fullWiki } from "./full-wiki";

const CACHE = "cache/embeddings.json";
const RIDGELINE = "summaries/2026-08-20-invoice-ridgeline-tools-r20931.md";
const EASTSIDE = "summaries/2026-10-02-invoice-eastside-auto-3381.md";

/** Every file in the store but the cache, path to body. */
async function storePages(store: WikiStore): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  for (const { path } of await store.manifest("")) {
    const entry = await store.read(path);
    if (entry) pages.set(path, entry.body);
  }
  return pages;
}

/** Replace the store's cache with one built by `embed`, as the fixture step does. */
async function rebuildCache(store: WikiStore, embed: Embed) {
  const { body } = await embedWiki({ pages: await storePages(store), embed });
  const current = await store.read(CACHE);
  await store.write(CACHE, body, { etag: current?.etag ?? null });
}

/** Empty the store's cache (the seeded fixture ships one). */
async function clearCache(store: WikiStore) {
  const current = await store.read(CACHE);
  await store.write(CACHE, "{}", { etag: current?.etag ?? null });
}

let store: WikiStore;
let cleanup = () => {};
beforeEach(async () => {
  ({ store, cleanup } = await fullWiki());
});
afterEach(() => cleanup());

describe("hybrid Matches with the fake adapter", () => {
  for (const [query, cited] of [
    ["What did the A/C diagnostic kit cost us?", RIDGELINE],
    ["What did the garage charge for the stopping repairs?", EASTSIDE],
  ] as const)
    test(`${query} has ${cited} among the Matches, Rung embedding`, async () => {
      const lexical = await createRetrieval({ store }).search({ query });
      assert.ok(
        !lexical.pages.some((p) => p.path === cited),
        "the row is semantic: keywords alone miss it"
      );
      await rebuildCache(store, fakeEmbed);
      const retrieval = createRetrieval({ store, embed: fakeEmbed });
      const result = await retrieval.search({ query });
      assert.equal(result.rung, "embedding");
      assert.equal(result.degraded, false);
      assert.ok(
        result.pages.some((p) => p.role === "match" && p.path === cited),
        result.pages.map((p) => p.path).join(", ")
      );
    });
});

/** 109 sections on fixtures/full, as the sectioning test counts them. */
const SECTIONS = 109;
const QUERY = "What did the A/C diagnostic kit cost us?";
const DELI = "summaries/2026-08-22-receipt-dockside-deli.md";

/** Edit a Page through the store, as a write tool would. */
async function edit(path: string, change: (body: string) => string) {
  const page = await store.read(path);
  assert.ok(page);
  await store.write(path, change(page.body), { etag: page.etag });
}

describe("the cache and the delta", () => {
  test("a warm cache embeds no section, and the query once per search", async () => {
    await rebuildCache(store, fakeEmbed);
    const { counts, embed } = countingEmbed(new Set([QUERY, "cash"]));
    const retrieval = createRetrieval({ store, embed });
    await retrieval.search({ query: QUERY });
    await retrieval.search({ query: "cash" });
    assert.equal(counts.sections, 0);
    assert.equal(counts.queries, 2);
  });

  test("an edited Page re-embeds only its sections, and the cache persists them", async () => {
    await rebuildCache(store, fakeEmbed);
    const { counts, embed } = countingEmbed(new Set([QUERY]));
    await createRetrieval({ store, embed }).search({ query: QUERY });
    await edit(DELI, (body) => `${body}\n- ZQUORBLAT tip\n`);
    const retrieval = createRetrieval({ store, embed });
    await retrieval.search({ query: QUERY });
    assert.ok(counts.sections > 0);
    assert.ok(
      counts.sectionTexts.every((t) => t.startsWith("Dockside Deli")),
      counts.sectionTexts.map((t) => t.split("\n")[0]).join(" | ")
    );
    const embedded = counts.sections;
    // A fresh instance reads the persisted cache: nothing left to embed.
    await createRetrieval({ store, embed }).search({ query: QUERY });
    assert.equal(counts.sections, embedded);
  });

  test("a header naming another model invalidates every vector; at most 20 sections embed per search", async () => {
    await rebuildCache(store, fakeEmbed);
    const cache = await store.read(CACHE);
    assert.ok(cache);
    const header = JSON.parse(cache.body) as {
      model: string;
      dimensions: number;
    };
    assert.equal(header.model, EMBEDDING_MODEL);
    assert.equal(header.dimensions, EMBEDDING_DIMENSIONS);
    await store.write(
      CACHE,
      JSON.stringify({
        ...JSON.parse(cache.body),
        model: "openai/text-embedding-3-large",
      }),
      { etag: cache.etag }
    );
    const { counts, embed } = countingEmbed(new Set([QUERY]));
    const retrieval = createRetrieval({ store, embed });
    const perSearch: number[] = [];
    for (let before = 0; perSearch.length < 8; before = counts.sections) {
      await retrieval.search({ query: QUERY });
      perSearch.push(counts.sections - before);
    }
    assert.equal(EMBED_PER_SEARCH, 20);
    assert.deepEqual(perSearch, [20, 20, 20, 20, 20, 9, 0, 0]);
    assert.equal(counts.sections, SECTIONS);
  });

  test("a header with other dimensions invalidates every vector too", async () => {
    await rebuildCache(store, fakeEmbed);
    const cache = await store.read(CACHE);
    assert.ok(cache);
    await store.write(
      CACHE,
      JSON.stringify({ ...JSON.parse(cache.body), dimensions: 1536 }),
      { etag: cache.etag }
    );
    const { counts, embed } = countingEmbed(new Set([QUERY]));
    await createRetrieval({ store, embed }).search({ query: QUERY });
    assert.equal(counts.sections, 20);
  });

  test("sections past the cap are keyword-only for that call", async () => {
    // An empty cache: the first search can embed 20 of 109 sections.
    await clearCache(store);
    const { embed } = countingEmbed(new Set());
    const retrieval = createRetrieval({ store, embed });
    const result = await retrieval.search({
      query: "What did the garage charge for the stopping repairs?",
    });
    // Eastside sorts past the first 20 sections, so it has no vector yet.
    assert.equal(result.rung, "embedding");
    assert.ok(!result.pages.some((p) => p.path === EASTSIDE));
  });

  test("the loser of a write race drops its write; the next search redoes the delta", async () => {
    await rebuildCache(store, fakeEmbed);
    await edit(DELI, (body) => `${body}\n- ZQUORBLAT tip\n`);
    let lose = true;
    const racing: WikiStore = {
      ...store,
      async write(path, body, options) {
        if (path === CACHE && lose) {
          // Another search persisted first.
          throw new WikiConflictError(path);
        }
        return store.write(path, body, options);
      },
    };
    const { counts, embed } = countingEmbed(new Set([QUERY]));
    const retrieval = createRetrieval({ store: racing, embed });
    const first = await retrieval.search({ query: QUERY });
    assert.equal(first.rung, "embedding");
    assert.equal(first.degraded, false);
    const lost = counts.sections;
    assert.ok(lost > 0);
    lose = false;
    await retrieval.search({ query: QUERY });
    assert.equal(counts.sections, 2 * lost, "redone and now persisted");
    await retrieval.search({ query: QUERY });
    assert.equal(counts.sections, 2 * lost);
  });

  test("a lexical-only instance never reads the cache and says nothing extra", async () => {
    const reads: string[] = [];
    const watched: WikiStore = {
      ...store,
      async read(path) {
        reads.push(path);
        return store.read(path);
      },
    };
    const result = await createRetrieval({ store: watched }).search({
      query: QUERY,
    });
    assert.equal(result.rung, "lexical");
    assert.equal(result.degraded, false);
    assert.ok(!reads.includes(CACHE));
    assert.ok(!renderResult(result).includes("Keyword matches only"));
  });
});

describe("Sources and scaffolding are never embedded", () => {
  const SOURCE = "sources/2026-10-30-receipt-zquorblat.md";
  const SOURCE_TEXT = "ZQUORBLAT receipt, card 4111 1111 1111 1111\n";
  const SCAFFOLDING = ["index.md", "log.md", "SCHEMA.md"];
  const leaked = (texts: string[]) =>
    texts.filter((t) => t.includes("ZQUORBLAT") || t.includes("Clerk reads"));

  test("by the fixture step", async () => {
    const pages = await storePages(store);
    pages.set(SOURCE, SOURCE_TEXT);
    assert.ok(SCAFFOLDING.every((p) => pages.has(p)));
    const { counts, embed } = countingEmbed(new Set());
    const { body } = await embedWiki({ pages, embed });
    assert.equal(counts.sections, SECTIONS);
    assert.deepEqual(leaked(counts.sectionTexts), []);
    const cached = Object.keys(
      (JSON.parse(body) as { pages: Record<string, unknown> }).pages
    );
    assert.equal(cached.length, 70);
    assert.ok(
      !cached.some((p) => p.startsWith("sources/") || SCAFFOLDING.includes(p))
    );
  });

  test("by a search", async () => {
    // A store whose manifest carries a Source, as a seeded namespace does.
    const withSource: WikiStore = {
      ...store,
      async manifest(prefix) {
        const entries = await store.manifest(prefix);
        return [...entries, { path: SOURCE, etag: "s1" }];
      },
      async read(path) {
        return path === SOURCE
          ? { body: SOURCE_TEXT, etag: "s1" }
          : store.read(path);
      },
    };
    await clearCache(store);
    const query = "zquorblat receipt";
    const { counts, embed } = countingEmbed(new Set([query]));
    const retrieval = createRetrieval({ store: withSource, embed });
    for (let i = 0; i < 7; i++) await retrieval.search({ query });
    assert.equal(counts.sections, SECTIONS, "every Page section, once");
    assert.equal(counts.queries, 7);
    assert.deepEqual(leaked(counts.sectionTexts), []);
  });

  test("a rerun of the fixture step keeps current vectors and embeds nothing", async () => {
    const pages = await storePages(store);
    const { body: previous } = await embedWiki({ pages, embed: fakeEmbed });
    const { counts, embed } = countingEmbed(new Set());
    assert.deepEqual(await embedWiki({ pages, embed, previous }), {
      body: previous,
      embedded: 0,
    });
    assert.equal(counts.calls, 0);
  });
});

describe("the committed fixture caches", () => {
  for (const [name, dir] of [
    ["full", FULL],
    ["base", BASE],
  ] as const)
    test(`fixtures/${name} seeds warm: no Page section embeds, one query embedding per search`, async () => {
      const seeded = await fullWiki(dir);
      try {
        const queries = ["cash", "Dana Okafor", QUERY];
        const { counts, embed } = countingEmbed(new Set(queries));
        const retrieval = createRetrieval({ store: seeded.store, embed });
        for (const query of queries) {
          const result = await retrieval.search({ query });
          assert.equal(result.rung, "embedding");
        }
        assert.equal(counts.sections, 0, counts.sectionTexts.join(" | "));
        assert.equal(counts.queries, 3);
        assert.equal(counts.calls, 3);
      } finally {
        seeded.cleanup();
      }
    });
});
