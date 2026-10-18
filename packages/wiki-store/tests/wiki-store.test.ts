import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  createWikiStore,
  WikiConflictError,
  WikiPathError,
  WikiReadOnlyError,
} from "../index";

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

function store(namespace: string, root = localRoot()) {
  return createWikiStore({ namespace, env: { WIKI_STORE_DIR: root } });
}

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
  const root = localRoot();
  const demo = store("demo", root);
  const session = store("eval/run-1/session-1", root);
  await demo.write("index.md", "demo", { etag: null });
  await session.write("index.md", "session", { etag: null });
  assert.equal((await demo.read("index.md"))?.body, "demo");
  assert.equal((await session.read("index.md"))?.body, "session");
  assert.deepEqual(await demo.list(""), ["index.md"]);
  assert.deepEqual(await store("eval/run-1/session-2", root).list(""), []);
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
  for (const namespace of ["", "../demo", "demo/", ".tmp", "a//b", "Demo Ns"])
    assert.throws(() => store(namespace), WikiPathError, namespace);
});

test("no write path exists under the sources/ prefix", async () => {
  const wiki = store("demo");
  await assert.rejects(
    wiki.write("sources/2024-10-21-ein-letter.md", "forged", { etag: null }),
    WikiReadOnlyError
  );
  await assert.rejects(
    wiki.write("sources/../sources/x.md", "forged", { etag: null }),
    WikiPathError
  );
  assert.deepEqual(await wiki.list("sources/"), []);
});

test("on Vercel the store selects the Blob backend, which is not built yet", async () => {
  const root = localRoot();
  const wiki = createWikiStore({
    namespace: "demo",
    env: { VERCEL: "1", WIKI_STORE_DIR: root },
  });
  await assert.rejects(wiki.read("index.md"), /Blob backend/);
  await assert.rejects(
    wiki.write("index.md", "x", { etag: null }),
    /Blob backend/
  );
  await assert.rejects(wiki.list(""), /Blob backend/);
  assert.deepEqual(await store("demo", root).list(""), []);
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
