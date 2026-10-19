import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { createWikiStore, type BlobClient } from "../index";
import { seedNamespace, WikiSeedError } from "../seed";
import { fakeBlob } from "./fake-blob";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "wiki-seed-test-"));
  dirs.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

/** A storage space: the env and Blob client every store and seed shares. */
type Space = { env: Record<string, string>; blob?: BlobClient };

const backends: Record<string, () => Space> = {
  local: () => ({ env: { WIKI_STORE_DIR: tree({}) } }),
  blob: () => ({ env: { VERCEL: "1" }, blob: fakeBlob().client }),
};

for (const [name, space] of Object.entries(backends))
  describe(`seeding the ${name} backend`, () => {
    function setup() {
      const { env, blob } = space();
      const fixtureDir = tree({
        "SCHEMA.md": "# Schema\n",
        "index.md": "# Index\n",
        "entities/harborview.md": "# Harborview\n",
      });
      const sourcesDir = tree({
        "2024-10-21-ein-letter.md": "EIN 12-3456789\n",
      });
      const seed = (force = false) =>
        seedNamespace({
          namespace: "demo",
          fixtureDir,
          sourcesDir,
          env,
          blob,
          force,
        });
      return {
        env,
        blob,
        seed,
        wiki: createWikiStore({ namespace: "demo", env, blob }),
      };
    }

    test("seeding copies the fixture's Pages and the Sources into the namespace", async () => {
      const { seed, wiki } = setup();
      assert.deepEqual(await seed(), { pages: 3, sources: 1, backend: name });
      assert.deepEqual(await wiki.list(""), [
        "SCHEMA.md",
        "entities/harborview.md",
        "index.md",
        "sources/2024-10-21-ein-letter.md",
      ]);
      assert.equal(
        (await wiki.read("sources/2024-10-21-ein-letter.md"))?.body,
        "EIN 12-3456789\n"
      );
    });

    test("seeding a namespace that has content refuses without force", async () => {
      const { seed, wiki } = setup();
      await seed();
      const { etag } = (await wiki.read("index.md"))!;
      await wiki.write("index.md", "# Edited\n", { etag });
      await assert.rejects(seed(), WikiSeedError);
      assert.equal((await wiki.read("index.md"))?.body, "# Edited\n");
    });

    test("seeding with force restores the fixture and drops Pages added since", async () => {
      const { seed, wiki } = setup();
      await seed();
      await wiki.write("obligations/new.md", "x", { etag: null });
      await seed(true);
      assert.equal(await wiki.read("obligations/new.md"), null);
      assert.equal((await wiki.read("index.md"))?.body, "# Index\n");
    });

    test("seeding leaves other namespaces alone", async () => {
      const { env, blob, seed } = setup();
      const other = createWikiStore({ namespace: "eval/run-1/s-1", env, blob });
      await other.write("index.md", "other", { etag: null });
      await seed();
      await seed(true);
      assert.deepEqual(await other.list(""), ["index.md"]);
    });

    test("a fixture that carries its own sources/ is refused", async () => {
      await assert.rejects(
        seedNamespace({
          namespace: "demo",
          fixtureDir: tree({ "sources/forged.md": "x" }),
          sourcesDir: tree({}),
          ...space(),
        }),
        WikiSeedError
      );
    });

    test("a missing fixture directory is refused", async () => {
      await assert.rejects(
        seedNamespace({
          namespace: "demo",
          fixtureDir: join(tree({}), "no-such-fixture"),
          sourcesDir: tree({}),
          ...space(),
        }),
        WikiSeedError
      );
    });
  });
