import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { validatePage } from "../../page-edits";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval, embedWiki, type Embed } from "../index";
import { sectionise } from "../lexical";
import { fakeEmbed } from "./fake-embed";
import { fullWiki } from "./full-wiki";

// One Page must never take retrieval down: whatever its frontmatter or body
// holds, every other Page stays searchable and flagged stays exhaustive.

let store: WikiStore;
let cleanup = () => {};
beforeEach(async () => {
  ({ store, cleanup } = await fullWiki());
});
afterEach(() => cleanup());

const RECEIPT = "summaries/2026-08-22-receipt-dockside-deli.md";

/** A Page validatePage accepts unless `extra` or `body` breaks it. */
const page = ({
  word,
  extra = "",
  flags = "flags: [needs-owner]",
  body = "",
}: {
  word: string;
  extra?: string;
  flags?: string;
  body?: string;
}) =>
  `---\ntitle: Hostile ${word}\nkind: entity\nsources: [2026-08-22-receipt-dockside-deli]\ncreated: 2026-10-23\nupdated: 2026-10-23\nstatus: active\n${flags}\n${extra}\n---\n\n${body}\n\nThe ${word} Page. (src: 2026-08-22-receipt-dockside-deli)\n`;

/** `levels` maps, each holding `fan` aliases of the one before: fan^levels nodes expanded. */
const laughs = (levels: number, fan: number, leaf = "{x: 1}") => {
  const lines = [`l0: &l0 ${leaf}`];
  for (let i = 1; i <= levels; i++)
    lines.push(
      `l${i}: &l${i} {${Array.from({ length: fan }, (_, j) => `k${j}: *l${i - 1}`).join(", ")}}`
    );
  return lines.join("\n");
};

/** Searches the Page itself and a control Query, and the flag, within `ms`. */
async function stillServes(
  path: string,
  word: string,
  {
    flagged = true,
    ms = 3000,
    embed,
  }: { flagged?: boolean; ms?: number; embed?: Embed } = {}
) {
  const retrieval = createRetrieval({ store, embed });
  const start = performance.now();
  for (let i = 0; i < 2; i++) {
    const own = await retrieval.search({ query: word, neighbourhood: true });
    assert.equal(own.pages[0]?.path, path, `${word} finds its Page`);
    assert.equal(own.degraded, false);
    const control = await retrieval.search({
      query: "Dockside Deli receipt",
      neighbourhood: true,
    });
    assert.ok(
      control.pages.some((p) => p.path === RECEIPT),
      "the rest of the Wiki is still searchable"
    );
    assert.ok(control.pages.some((p) => p.role === "neighbour"));
    const paths = (await retrieval.flagged("needs-owner")).map((p) => p.path);
    assert.equal(paths.includes(path), flagged, "flagged");
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < ms, `took ${Math.round(elapsed)} ms`);
  return retrieval;
}

describe("frontmatter aliases", () => {
  const CASES: Array<{
    name: string;
    extra?: string;
    flags?: string;
    flagged?: boolean;
  }> = [
    { name: "selfalias", extra: "extra: &loop\n  self: *loop" },
    {
      name: "mutualalias",
      extra: "a: &a\n  b: &b\n    back: *a\n  again: *b\nc: *a",
    },
    { name: "flowcycle", extra: "extra: &loop {self: *loop, list: [*loop]}" },
    { name: "flagsalias", flags: "marks: &m [needs-owner]\nflags: *m" },
    { name: "flagsselfseq", flags: "flags: &f [needs-owner, *f]" },
    { name: "flagsselfmap", flags: "flags: &f {self: *f}", flagged: false },
    {
      name: "deepnesting",
      extra: Array.from(
        { length: 2000 },
        (_, i) => `${"  ".repeat(i)}k${i}:${i === 1999 ? " v" : ""}`
      ).join("\n"),
    },
    { name: "mapfanout", extra: laughs(30, 10) },
    { name: "emptyfanout", extra: laughs(30, 10, "{}") },
    { name: "seqfanout", extra: laughs(30, 10, "[a, b, c]") },
  ];
  for (const { name, extra, flags, flagged } of CASES)
    test(`${name}: the Page and every other stay searchable, flagged stays exhaustive`, async () => {
      const path = `entities/${name}.md`;
      await store.write(path, page({ word: name, extra, flags }), {
        etag: null,
      });
      await stillServes(path, name, { flagged: flagged ?? true });
    });

  test("validatePage accepts a self-referencing alias, so a write can carry one", () => {
    const text = page({ word: "x", extra: "extra: &loop\n  self: *loop" });
    assert.doesNotThrow(() => validatePage("entities/x.md", text));
  });

  test("an acyclic alias still folds into section 0; a cycle folds what it can, once", () => {
    const [dag] = sectionise(
      "summaries/a.md",
      "---\ntitle: A\nkind: summary\nterms: &t {status: paid, method: card}\nexpense:\n  payment: *t\n---\n\nBody\n"
    );
    assert.deepEqual(dag.lines, [
      "title: A",
      "kind: summary",
      "status: paid",
      "method: card",
      "payment.status: paid",
      "payment.method: card",
      "Body",
    ]);
    const [loop] = sectionise(
      "entities/a.md",
      "---\ntitle: A\nextra: &loop\n  note: here\n  self: *loop\n---\n\nBody\n"
    );
    assert.deepEqual(loop.lines, ["title: A", "note: here", "Body"]);
  });

  test("an alias fan-out folds a bounded number of facts", () => {
    const [top] = sectionise(
      "entities/a.md",
      `---\ntitle: A\n${laughs(30, 10)}\n---\n\nBody\n`
    );
    assert.ok(top.lines.length <= 1001, `${top.lines.length} lines`);
  });
});

describe("bodies that break the Markdown parser", () => {
  test("deeply nested blockquotes: the Page keeps its frontmatter Links", async () => {
    const path = "entities/deepquotes.md";
    await store.write(
      path,
      page({ word: "deepquotes", body: `${">".repeat(100_000)} x` }),
      { etag: null }
    );
    const retrieval = await stillServes(path, "deepquotes");
    const own = await retrieval.search({
      query: "deepquotes",
      neighbourhood: true,
    });
    assert.ok(
      own.pages.some((p) => p.path === RECEIPT && p.role === "neighbour"),
      "the frontmatter's sources still cite the receipt"
    );
  });

  test("a deeply nested blockquote inside the parsed part of the body", async () => {
    const path = "entities/nearquotes.md";
    await store.write(
      path,
      page({ word: "nearquotes", body: `${">".repeat(15_000)} x` }),
      { etag: null }
    );
    await stillServes(path, "nearquotes");
  });

  test("emphasis the parser takes quadratic time over stays bounded", async () => {
    const path = "entities/emphasis.md";
    await store.write(
      path,
      page({ word: "emphasis", body: "*a _b ".repeat(40_000) }),
      { etag: null }
    );
    await stillServes(path, "emphasis");
  });

  test("one line of thousands of nested markers stays bounded", async () => {
    const path = "entities/onelinenest.md";
    await store.write(
      path,
      page({ word: "onelinenest", body: "> - 1. ".repeat(20_000) + "x" }),
      { etag: null }
    );
    await stillServes(path, "onelinenest");
  });

  test("a list item's 500 KB paragraph stays bounded and keeps its last Link", async () => {
    const path = "entities/longitem.md";
    const dental = "entities/bayside-family-dental.md";
    await store.write(
      path,
      page({
        word: "longitem",
        body: `- a\n${"    word\n".repeat(60_000)}    [Dental](bayside-family-dental.md)`,
      }),
      { etag: null }
    );
    const retrieval = await stillServes(path, "longitem");
    const own = await retrieval.search({
      query: "longitem",
      neighbourhood: true,
    });
    assert.ok(
      own.pages.some((p) => p.path === dental && p.role === "neighbour")
    );
  });

  test("deeply nested lists followed by blank lines stay bounded", async () => {
    const path = "entities/nestedblanks.md";
    const nested = Array.from(
      { length: 1000 },
      (_, i) => `${" ".repeat(i * 2)}- a`
    ).join("\n");
    await store.write(
      path,
      page({
        word: "nestedblanks",
        body: `${nested}${"\n".repeat(200_000)}${" ".repeat(2000)}\`\`\`${"\n".repeat(200_000)}`,
      }),
      { etag: null }
    );
    await stillServes(path, "nestedblanks");
  });

  test("deeply nested lists stay bounded", async () => {
    const path = "entities/nestedlists.md";
    await store.write(
      path,
      page({
        word: "nestedlists",
        body: Array.from(
          { length: 600 },
          (_, i) => `${" ".repeat(i * 2)}- a`
        ).join("\n"),
      }),
      { etag: null }
    );
    await stillServes(path, "nestedlists");
  });
});

describe("sections that break the embedding input", () => {
  /** Like the Gateway: rejects the whole batch if any input is empty or over the model's 8191-token limit (a token is at least a byte). */
  const strictEmbed: Embed = async (texts) => {
    for (const text of texts)
      if (!text || Buffer.byteLength(text) > 8191)
        throw new Error(`input of ${Buffer.byteLength(text)} bytes rejected`);
    return fakeEmbed(texts);
  };

  test("a one-line section of 200 KB neither degrades nor blocks the delta", async () => {
    const path = "entities/longline.md";
    await store.write(
      path,
      page({
        word: "longline",
        body: `- **Note**: ${"ünïcödé wörd ".repeat(15_000)}`,
      }),
      { etag: null }
    );
    await stillServes(path, "longline", { embed: strictEmbed });
    const pages = new Map<string, string>();
    for (const { path: p } of await store.manifest("")) {
      const entry = await store.read(p);
      if (entry) pages.set(p, entry.body);
    }
    const { embedded } = await embedWiki({ pages, embed: strictEmbed });
    assert.ok(embedded > 100);
  });

  test("a Query over the limit is cut, not degraded", async () => {
    const retrieval = createRetrieval({ store, embed: strictEmbed });
    const result = await retrieval.search({
      query: `Dockside Deli ${"wörd ".repeat(5000)}`,
    });
    assert.equal(result.degraded, false);
    assert.equal(result.rung, "embedding");
  });
});

describe("a Page that cannot be read as a Page", () => {
  test("is skipped, read once, and never fails the refresh", async () => {
    const path = "entities/corrupt.md";
    await store.write(path, page({ word: "corrupt" }), { etag: null });
    let reads = 0;
    const view: WikiStore = {
      ...store,
      async read(p) {
        const entry = await store.read(p);
        if (p !== path || !entry) return entry;
        reads++;
        // Not a string: whatever splitting or parsing it tries throws.
        return { ...entry, body: { corrupt: true } as unknown as string };
      },
    };
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (message: string) => void warnings.push(message);
    try {
      const retrieval = createRetrieval({ store: view });
      for (let i = 0; i < 2; i++) {
        const own = await retrieval.search({
          query: "corrupt",
          neighbourhood: true,
        });
        assert.ok(own.pages.every((p) => p.path !== path));
        const control = await retrieval.search({ query: "Dockside Deli" });
        assert.ok(control.pages.some((p) => p.path === RECEIPT));
        assert.ok(
          (await retrieval.flagged("conflict")).some(
            (p) => p.path === "profile.md"
          )
        );
      }
      assert.equal(reads, 1);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /entities\/corrupt\.md/);
    } finally {
      console.warn = warn;
    }
  });
});
