import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  createWikiStore,
  WikiConflictError,
  WikiPathError,
  WikiReadOnlyError,
  type WikiStore,
} from "../index";
import { fakeBlob } from "./fake-blob";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function localRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wiki-store-test-"));
  roots.push(root);
  return root;
}

/** One empty storage space; every namespace opened from it shares it. */
type Space = (namespace: string) => WikiStore;

const backends: Record<string, () => Space> = {
  local: () => {
    const root = localRoot();
    return (namespace) =>
      createWikiStore({ namespace, env: { WIKI_STORE_DIR: root } });
  },
  blob: () => {
    const { client } = fakeBlob();
    return (namespace) =>
      createWikiStore({ namespace, env: { VERCEL: "1" }, blob: client });
  },
};

for (const [name, space] of Object.entries(backends))
  describe(`the ${name} backend`, () => {
    const store = (namespace: string, shared: Space = space()) =>
      shared(namespace);

    test("a Page written without an etag can be read back with its etag", async () => {
      const wiki = store("demo");
      const { etag } = await wiki.write("profile.md", "# Profile\n", {
        etag: null,
      });
      assert.deepEqual(await wiki.read("profile.md"), {
        body: "# Profile\n",
        etag,
      });
    });

    test("a missing Page reads as null", async () => {
      assert.equal(await store("demo").read("nope.md"), null);
    });

    test("a write with a stale etag fails with a conflict and keeps the newer body", async () => {
      const wiki = store("demo");
      const first = await wiki.write("index.md", "v1", { etag: null });
      await wiki.write("index.md", "v2", { etag: first.etag });
      await assert.rejects(
        wiki.write("index.md", "v3", { etag: first.etag }),
        WikiConflictError
      );
      assert.equal((await wiki.read("index.md"))?.body, "v2");
    });

    test("creating a Page that already exists fails with a conflict", async () => {
      const wiki = store("demo");
      await wiki.write("index.md", "v1", { etag: null });
      await assert.rejects(
        wiki.write("index.md", "v2", { etag: null }),
        WikiConflictError
      );
    });

    test("updating a Page that does not exist fails with a conflict", async () => {
      await assert.rejects(
        store("demo").write("index.md", "v1", { etag: "made-up" }),
        WikiConflictError
      );
    });

    test("list returns only the paths under the prefix, sorted", async () => {
      const wiki = store("demo");
      for (const path of [
        "obligations/b.md",
        "obligations/a.md",
        "obligations-archive.md",
        "entities/x.md",
        "index.md",
      ])
        await wiki.write(path, "x", { etag: null });
      assert.deepEqual(await wiki.list("obligations/"), [
        "obligations/a.md",
        "obligations/b.md",
      ]);
      assert.deepEqual(await wiki.list("nothing/"), []);
      assert.equal((await wiki.list("")).length, 5);
    });

    test("manifest lists each path under the prefix with the etag read returns, sorted", async () => {
      const wiki = store("demo");
      for (const path of ["obligations/b.md", "obligations/a.md", "index.md"])
        await wiki.write(path, `# ${path}\n`, { etag: null });
      const manifest = await wiki.manifest("obligations/");
      assert.deepEqual(
        manifest.map((entry) => entry.path),
        ["obligations/a.md", "obligations/b.md"]
      );
      for (const { path, etag } of manifest)
        assert.equal(etag, (await wiki.read(path))?.etag);
      assert.equal((await wiki.manifest("")).length, 3);
      assert.deepEqual(await wiki.manifest("nothing/"), []);
      await assert.rejects(wiki.manifest("../"), WikiPathError);
    });

    test("manifest shows a changed etag after a write", async () => {
      const wiki = store("demo");
      await wiki.write("index.md", "v1", { etag: null });
      const [before] = await wiki.manifest("");
      await wiki.write("index.md", "v2", { etag: before.etag });
      const [after] = await wiki.manifest("");
      assert.notEqual(after.etag, before.etag);
      assert.equal(after.etag, (await wiki.read("index.md"))?.etag);
    });

    test("list and manifest never show a path under the hidden cache/ prefix", async () => {
      const wiki = store("demo");
      await wiki.write("index.md", "# Index\n", { etag: null });
      await wiki.write("cache/embeddings.json", "{}", { etag: null });
      await wiki.write("cache/nested/x.md", "x", { etag: null });
      await wiki.write("cache-notes.md", "not hidden", { etag: null });
      assert.deepEqual(await wiki.list(""), ["cache-notes.md", "index.md"]);
      assert.deepEqual(await wiki.list("cache/"), []);
      assert.deepEqual(await wiki.list("cache"), ["cache-notes.md"]);
      assert.deepEqual(
        (await wiki.manifest("")).map((entry) => entry.path),
        ["cache-notes.md", "index.md"]
      );
      assert.deepEqual(await wiki.manifest("cache/"), []);
    });

    test("the cache file reads and writes with etag guards like any path", async () => {
      const wiki = store("demo");
      const path = "cache/embeddings.json";
      assert.equal(await wiki.read(path), null);
      const first = await wiki.write(path, '{"v":1}', { etag: null });
      assert.deepEqual(await wiki.read(path), {
        body: '{"v":1}',
        etag: first.etag,
      });
      await assert.rejects(
        wiki.write(path, "{}", { etag: null }),
        WikiConflictError
      );
      const second = await wiki.write(path, '{"v":2}', { etag: first.etag });
      await assert.rejects(
        wiki.write(path, '{"v":3}', { etag: first.etag }),
        WikiConflictError
      );
      assert.deepEqual(await wiki.read(path), {
        body: '{"v":2}',
        etag: second.etag,
      });
    });

    test("namespaces sharing a root never see each other's Pages", async () => {
      const shared = space();
      const demo = store("demo", shared);
      const session = store("eval/run-1/session-1", shared);
      await demo.write("index.md", "demo", { etag: null });
      await session.write("index.md", "session", { etag: null });
      assert.equal((await demo.read("index.md"))?.body, "demo");
      assert.equal((await session.read("index.md"))?.body, "session");
      assert.deepEqual(await demo.list(""), ["index.md"]);
      assert.deepEqual(
        await store("eval/run-1/session-2", shared).list(""),
        []
      );
    });

    test("paths that could escape the namespace are rejected", async () => {
      const wiki = store("demo");
      for (const path of [
        "../other/index.md",
        "a/../../x.md",
        "/etc/passwd",
        "a//b.md",
        "a\\b.md",
        "",
      ]) {
        await assert.rejects(wiki.read(path), WikiPathError, path);
        await assert.rejects(
          wiki.write(path, "x", { etag: null }),
          WikiPathError,
          path
        );
      }
      await assert.rejects(wiki.list("../"), WikiPathError);
    });

    test("an invalid namespace is rejected at construction", () => {
      for (const namespace of [
        "",
        "../demo",
        "demo/",
        ".tmp",
        "a//b",
        "Demo Ns",
      ])
        assert.throws(() => store(namespace), WikiPathError, namespace);
    });

    test("no write path exists under the sources/ prefix", async () => {
      const wiki = store("demo");
      await assert.rejects(
        wiki.write("sources/2024-10-21-ein-letter.md", "forged", {
          etag: null,
        }),
        WikiReadOnlyError
      );
      await assert.rejects(
        wiki.write("sources/../sources/x.md", "forged", { etag: null }),
        WikiPathError
      );
      assert.deepEqual(await wiki.list("sources/"), []);
    });

    test("of two concurrent writes from the same etag exactly one wins", async () => {
      const wiki = store("demo");
      const { etag } = await wiki.write("log.md", "v0", { etag: null });
      const results = await Promise.allSettled([
        wiki.write("log.md", "a", { etag }),
        wiki.write("log.md", "b", { etag }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [
        "fulfilled",
        "rejected",
      ]);
    });
  });

test("on Vercel the store keeps Pages in Blob under wiki/<namespace>/", async () => {
  const root = localRoot();
  const { client, blobs } = fakeBlob();
  const wiki = createWikiStore({
    namespace: "demo",
    env: { VERCEL: "1", WIKI_STORE_DIR: root },
    blob: client,
  });
  await wiki.write("entities/harborview.md", "# Harborview\n", { etag: null });
  assert.deepEqual([...blobs.keys()], ["wiki/demo/entities/harborview.md"]);
  const local = createWikiStore({
    namespace: "demo",
    env: { WIKI_STORE_DIR: root },
  });
  assert.deepEqual(await local.list(""), []);
});

test("on Blob, manifest takes the etags from the listing and reads nothing", async () => {
  const { client, calls } = fakeBlob(1000);
  const wiki = createWikiStore({
    namespace: "demo",
    env: { VERCEL: "1" },
    blob: client,
  });
  for (const path of ["index.md", "profile.md", "cache/embeddings.json"])
    await wiki.write(path, "x", { etag: null });
  calls.get = calls.list = 0;
  assert.equal((await wiki.manifest("")).length, 2);
  assert.deepEqual({ get: calls.get, list: calls.list }, { get: 0, list: 1 });
});

test("under eve dev and eve eval the store never touches Blob, even with VERCEL set", async () => {
  // eve dev and eve eval (without --url) run tools in a child process that
  // always has EVE_DEV=1 (eve 0.80.1 createDevelopmentServer).
  const root = localRoot();
  const { client, calls } = fakeBlob();
  const wiki = createWikiStore({
    namespace: "eval/run-1/session-1",
    env: { VERCEL: "1", EVE_DEV: "1", WIKI_STORE_DIR: root },
    blob: client,
  });
  await wiki.write("index.md", "# Index\n", { etag: null });
  assert.equal((await wiki.read("index.md"))?.body, "# Index\n");
  await wiki.list("");
  assert.deepEqual(calls, { get: 0, put: 0, list: 0, del: 0 });
});
