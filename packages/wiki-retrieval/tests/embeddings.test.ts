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
  type ResultPage,
  type RetrievalResult,
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

describe("the hop on with the fake adapter", () => {
  test("the Neighbourhood rows fuse, then hop: Rung embedding, the August statement found, neighbours after Matches", async () => {
    await rebuildCache(store, fakeEmbed);
    const retrieval = createRetrieval({ store, embed: fakeEmbed });
    for (const query of [
      "Is there bank evidence that the Ridgeline order was paid?",
      "Which purchases did the August bank statement confirm?",
    ]) {
      const result = await retrieval.search({ query, neighbourhood: true });
      assert.equal(result.rung, "embedding", query);
      assert.equal(result.degraded, false, query);
      assert.equal(result.hopRan, true, query);
      assert.ok(result.pages.length <= 8, query);
      const roles = result.pages.map((p) => p.role);
      assert.ok(roles.includes("neighbour"), query);
      assert.deepEqual(
        roles,
        [...roles].sort((a, b) => (a === b ? 0 : a === "match" ? -1 : 1)),
        "Matches first, then neighbours"
      );
      assert.ok(
        result.pages.some(
          (p) => p.path === "summaries/2026-08-31-bank-statement-tidewater.md"
        ),
        query
      );
    }
  });
});

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

describe("edits and failures during a search", () => {
  test("a Page edited while its sections embed is embedded again for its new text", async () => {
    await rebuildCache(store, fakeEmbed);
    await edit(DELI, (body) => `${body}\n- FIRST EDIT tip\n`);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const paused: Embed = async (texts) => {
      if (!(texts.length === 1 && texts[0] === QUERY)) await gate;
      return fakeEmbed(texts);
    };
    const retrieval = createRetrieval({ store, embed: paused });
    const searching = retrieval.search({ query: QUERY });
    await new Promise((r) => setTimeout(r, 20));
    await edit(DELI, (body) => body.replace("FIRST EDIT", "SECOND EDIT"));
    await retrieval.flagged("conflict"); // refreshes the instance's Pages
    release();
    await searching;
    const { counts, embed } = countingEmbed(new Set([QUERY]));
    await createRetrieval({ store, embed }).search({ query: QUERY });
    assert.ok(
      counts.sectionTexts.some((t) => t.includes("SECOND EDIT")),
      "the second edit's text was never embedded"
    );
  });

  test("a cache that cannot be read fails the search; it is not an embedding failure", async () => {
    const broken: WikiStore = {
      ...store,
      async read(path) {
        if (path === CACHE) throw new Error("blob read failed");
        return store.read(path);
      },
    };
    const { counts, embed } = countingEmbed(new Set([QUERY]));
    await assert.rejects(
      createRetrieval({ store: broken, embed }).search({ query: QUERY }),
      /blob read failed/
    );
    assert.equal(counts.calls, 0);
  });
});

describe("one search answers from one snapshot of the Pages", () => {
  const SNAP = "summaries/zz-snapshot-invoice.md";
  const OLD = { title: "Old invoice", status: "active", amount: "100.00" };
  const NEW = {
    title: "Corrected invoice",
    status: "superseded",
    amount: "999.00",
  };
  const ask = { query: "zquorblat invoice" };

  function body({ title, status, amount }: typeof OLD) {
    return `---\ntitle: ${title}\nkind: summary\nstatus: ${status}\nflags: []\n---\n\n- ZQUORBLAT invoice amount ${amount}\n`;
  }

  /** An adapter that holds every call until `release`, and says when one is waiting. */
  function pausedEmbed() {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let waiting = () => {};
    const entered = new Promise<void>((r) => (waiting = r));
    const embed: Embed = async (texts) => {
      waiting();
      await gate;
      return fakeEmbed(texts);
    };
    return { embed, release, entered };
  }

  /** The Match for SNAP, as one revision or the other; fails on a mix. */
  function revisionOf(result: { pages: ResultPage[] }) {
    const page = result.pages.find((p) => p.path === SNAP);
    assert.ok(page, "the Page is a Match");
    const seen = {
      title: page.title,
      status: page.status,
      excerpt: page.excerpt?.join("\n") ?? "",
    };
    for (const [name, rev] of [
      ["old", OLD],
      ["new", NEW],
    ] as const)
      if (
        seen.title === rev.title &&
        seen.status === rev.status &&
        seen.excerpt.includes(rev.amount)
      )
        return name;
    assert.fail(`no revision of the Page reads like ${JSON.stringify(seen)}`);
  }

  async function replace(rev: typeof OLD) {
    const current = await store.read(SNAP);
    await store.write(SNAP, body(rev), { etag: current?.etag ?? null });
  }

  beforeEach(async () => {
    await rebuildCache(store, fakeEmbed);
    await replace(OLD);
  });

  test("an edit refreshed by flagged() while the search embeds: the result is wholly the old revision", async () => {
    const { embed, release, entered } = pausedEmbed();
    const retrieval = createRetrieval({ store, embed });
    const searching = retrieval.search(ask);
    await entered;
    await replace(NEW);
    await retrieval.flagged("conflict");
    release();
    assert.equal(revisionOf(await searching), "old");
    assert.equal(revisionOf(await retrieval.search(ask)), "new");
  });

  test("a second search refreshing while the first embeds: each is wholly its own revision", async () => {
    const { embed, release, entered } = pausedEmbed();
    const retrieval = createRetrieval({ store, embed });
    const first = retrieval.search(ask);
    await entered;
    await replace(NEW);
    const second = retrieval.search(ask);
    // Let the second search's refresh land before the first resumes.
    await retrieval.flagged("conflict");
    release();
    assert.equal(revisionOf(await first), "old");
    assert.equal(revisionOf(await second), "new");
  });

  test("a Page deleted while the search embeds: the search still reads it as it was", async () => {
    const hidden = new Set<string>();
    const view: WikiStore = {
      ...store,
      async manifest(prefix) {
        return (await store.manifest(prefix)).filter(
          (e) => !hidden.has(e.path)
        );
      },
      async read(path) {
        return hidden.has(path) ? null : store.read(path);
      },
    };
    const { embed, release, entered } = pausedEmbed();
    const retrieval = createRetrieval({ store: view, embed });
    const searching = retrieval.search(ask);
    await entered;
    hidden.add(SNAP);
    await retrieval.flagged("conflict");
    release();
    assert.equal(revisionOf(await searching), "old");
    assert.ok(
      !(await retrieval.search(ask)).pages.some((p) => p.path === SNAP)
    );
  });

  test("a refresh that fails part-way while the search embeds: the search is wholly the old revision", async () => {
    // The failing refresh reads SNAP's new text, then fails on another Page.
    const FLAKY = "summaries/zzz-flaky.md";
    let fail = false;
    const view: WikiStore = {
      ...store,
      async read(path) {
        if (fail && path === FLAKY) throw new Error("network");
        return store.read(path);
      },
    };
    const { embed, release, entered } = pausedEmbed();
    const retrieval = createRetrieval({ store: view, embed });
    const searching = retrieval.search(ask);
    await entered;
    await replace(NEW);
    await store.write(
      FLAKY,
      "---\ntitle: Flaky\nkind: entity\n---\n\nFLAKY\n",
      { etag: null }
    );
    fail = true;
    await assert.rejects(retrieval.flagged("conflict"), /network/);
    release();
    assert.equal(revisionOf(await searching), "old");
    fail = false;
    assert.equal(revisionOf(await retrieval.search(ask)), "new");
  });

  describe("with the hop on, Links come from that snapshot too", () => {
    const OLD_PARTY = "entities/zz-old-party.md";
    const NEW_PARTY = "entities/zz-new-party.md";
    const hopAsk = { ...ask, neighbourhood: true };

    /** SNAP at `rev`, linking to `party` in its body. */
    function linking(rev: typeof OLD, party: string) {
      return `${body(rev)}- Paid to [the party](../${party})\n`;
    }
    const party = (title: string) =>
      `---\ntitle: ${title}\nkind: entity\nstatus: active\nflags: []\n---\n\n- A counterparty\n`;

    async function put(path: string, text: string) {
      const current = await store.read(path);
      await store.write(path, text, { etag: current?.etag ?? null });
    }

    beforeEach(async () => {
      await put(OLD_PARTY, party("Old party"));
      await put(NEW_PARTY, party("New party"));
      await put(SNAP, linking(OLD, OLD_PARTY));
    });

    /** Which revision SNAP's Link and its neighbour read as; fails on a mix. */
    function hopRevisionOf(result: RetrievalResult) {
      assert.equal(result.hopRan, true);
      const page = revisionOf(result);
      const via = (path: string) =>
        result.pages.find(
          (p) =>
            p.path === path &&
            p.role === "neighbour" &&
            p.via?.some((v) => v.match === SNAP)
        );
      const old = via(OLD_PARTY);
      const now = via(NEW_PARTY);
      const seen =
        old && !now && old.title === "Old party"
          ? "old"
          : now && !old
            ? "new"
            : "mixed";
      assert.equal(seen, page, JSON.stringify(result.pages));
      return page;
    }

    async function edit() {
      await put(SNAP, linking(NEW, NEW_PARTY));
      await put(OLD_PARTY, party("Old party, renamed"));
    }

    test("an edit refreshed by flagged() while the search embeds: the Links are wholly the old revision", async () => {
      const { embed, release, entered } = pausedEmbed();
      const retrieval = createRetrieval({ store, embed });
      const searching = retrieval.search(hopAsk);
      await entered;
      await edit();
      await retrieval.flagged("conflict");
      release();
      assert.equal(hopRevisionOf(await searching), "old");
      assert.equal(hopRevisionOf(await retrieval.search(hopAsk)), "new");
    });

    test("a second hop-on search refreshing while the first embeds: each is wholly its own revision", async () => {
      const { embed, release, entered } = pausedEmbed();
      const retrieval = createRetrieval({ store, embed });
      // The first search builds the old Link table; the second, the new one.
      const first = retrieval.search(hopAsk);
      await entered;
      await edit();
      const second = retrieval.search(hopAsk);
      await retrieval.flagged("conflict");
      release();
      assert.equal(hopRevisionOf(await second), "new");
      assert.equal(hopRevisionOf(await first), "old");
      assert.equal(hopRevisionOf(await retrieval.search(hopAsk)), "new");
    });
  });
});

describe("a Link-bearing search answers from one snapshot of the Pages", () => {
  const SNAP = "summaries/zz-linked-invoice.md";
  const OLD_PARTY = "entities/zz-old-party.md";
  const NEW_PARTY = "entities/zz-new-party.md";
  const ask = { query: "zquorblat invoice", limit: 1, neighbourhood: true };

  const body = (party: string, amount: string) =>
    `---\ntitle: Linked invoice\nkind: summary\nstatus: active\nflags: []\n---\n\n- ZQUORBLAT invoice amount ${amount}, billed by [the party](../${party})\n`;

  async function replace(text: string) {
    const current = await store.read(SNAP);
    await store.write(SNAP, text, { etag: current?.etag ?? null });
  }

  /** An adapter that holds only its first call until `release`. */
  function firstCallPaused() {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let waiting = () => {};
    const entered = new Promise<void>((r) => (waiting = r));
    let calls = 0;
    const embed: Embed = async (texts) => {
      if (calls++ === 0) {
        waiting();
        await gate;
      }
      return fakeEmbed(texts);
    };
    return { embed, release, entered };
  }

  /** The search's revision, read off its Match excerpt and its neighbours. */
  function revisionOf(result: { pages: ResultPage[] }) {
    const match = result.pages.find((p) => p.path === SNAP);
    assert.equal(match?.role, "match");
    const excerpt = match?.excerpt?.join("\n") ?? "";
    const near = result.pages
      .filter((p) => p.role === "neighbour")
      .map((p) => p.path);
    if (excerpt.includes("100.00")) {
      assert.ok(near.includes(OLD_PARTY), "the old Link reaches the old party");
      assert.ok(!near.includes(NEW_PARTY), "no Link of the new revision");
      return "old";
    }
    assert.ok(excerpt.includes("999.00"));
    assert.ok(near.includes(NEW_PARTY), "the new Link reaches the new party");
    assert.ok(!near.includes(OLD_PARTY), "no Link of the old revision");
    return "new";
  }

  beforeEach(async () => {
    for (const [path, title] of [
      [OLD_PARTY, "Old party"],
      [NEW_PARTY, "New party"],
    ]) {
      const current = await store.read(path);
      await store.write(
        path,
        `---\ntitle: ${title}\nkind: entity\nstatus: active\nflags: []\n---\n\n- A vendor.\n`,
        { etag: current?.etag ?? null }
      );
    }
    await replace(body(OLD_PARTY, "100.00"));
    await rebuildCache(store, fakeEmbed);
  });

  test("a newer search refreshes while the first embeds: each hops over its own revision's Links", async () => {
    const { embed, release, entered } = firstCallPaused();
    const retrieval = createRetrieval({ store, embed });
    const first = retrieval.search(ask);
    await entered;
    await replace(body(NEW_PARTY, "999.00"));
    const second = retrieval.search(ask);
    // Let the second search's refresh land before the first resumes.
    await retrieval.flagged("conflict");
    release();
    assert.equal(revisionOf(await first), "old");
    assert.equal(revisionOf(await second), "new");
  });

  test("a hop after a lexical-only search at a newer revision still reads the newer Links", async () => {
    const retrieval = createRetrieval({ store, embed: fakeEmbed });
    assert.equal(revisionOf(await retrieval.search(ask)), "old");
    await replace(body(NEW_PARTY, "999.00"));
    await retrieval.search({ query: "zquorblat invoice" });
    assert.equal(revisionOf(await retrieval.search(ask)), "new");
  });
});
