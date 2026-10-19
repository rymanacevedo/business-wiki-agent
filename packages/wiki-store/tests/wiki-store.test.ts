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
