import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createRetrieval, type Embed } from "../../packages/wiki-retrieval";
import { createWikiStore } from "../../packages/wiki-store";
import { seedNamespace } from "../../packages/wiki-store/seed";
import { embedFixture } from "../lib/fixture-embed";

const FULL = resolve(import.meta.dirname, "../../fixtures/full");
const CACHE = "cache/embeddings.json";

// A deterministic stand-in: a vector from the text's character codes.
function counting() {
  const counts = { texts: 0 };
  const embed: Embed = async (texts) => {
    counts.texts += texts.length;
    return texts.map((t) => {
      const v = Array.from({ length: 512 }, () => 0);
      for (let i = 0; i < t.length; i++) v[t.charCodeAt(i) % 512] += 1;
      return v;
    });
  };
  return { counts, embed };
}

/** Every file under `dir`, relative path to body. */
function files(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  }))
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      out.set(path.slice(dir.length + 1), readFileSync(path, "utf8"));
    }
  return out;
}

let dir = "";
let root = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fixture-embed-test-"));
  root = mkdtempSync(join(tmpdir(), "fixture-embed-store-"));
  cpSync(FULL, dir, { recursive: true });
  rmSync(join(dir, "cache"), { recursive: true, force: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test("the embed step adds cache/embeddings.json and changes nothing else", async () => {
  const before = files(dir);
  const { counts, embed } = counting();
  const result = await embedFixture(dir, embed);
  assert.equal(result.embedded, 109);
  assert.equal(counts.texts, 109);
  const after = files(dir);
  assert.deepEqual(
    [...after.keys()].filter((p) => !before.has(p)),
    [CACHE]
  );
  for (const [path, body] of before) assert.equal(after.get(path), body, path);
});

test("a rerun over an unchanged fixture embeds nothing and leaves the cache byte-identical", async () => {
  const { counts, embed } = counting();
  await embedFixture(dir, embed);
  const first = readFileSync(join(dir, CACHE), "utf8");
  const again = await embedFixture(dir, embed);
  assert.equal(again.embedded, 0);
  assert.equal(counts.texts, 109);
  assert.equal(readFileSync(join(dir, CACHE), "utf8"), first);
});

test("a fixture seeded with its cache starts warm: no Page section embeds, one query per search", async () => {
  const { embed: build } = counting();
  await embedFixture(dir, build);
  const sourcesDir = mkdtempSync(join(tmpdir(), "fixture-embed-sources-"));
  const env = { WIKI_STORE_DIR: root };
  await seedNamespace({ namespace: "t", fixtureDir: dir, sourcesDir, env });
  rmSync(sourcesDir, { recursive: true, force: true });
  const { counts, embed } = counting();
  const retrieval = createRetrieval({
    store: createWikiStore({ namespace: "t", env }),
    embed,
  });
  const result = await retrieval.search({ query: "cash" });
  await retrieval.search({ query: "Dana Okafor" });
  assert.equal(result.rung, "embedding");
  assert.equal(counts.texts, 2, "the two queries, no section");
});
