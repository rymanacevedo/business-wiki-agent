import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore } from "../../../packages/wiki-store";
import readPage from "../../tools/read_page";

// read_page opens several Pages in one call: every call re-sends the whole
// conversation, so one step that reads five Pages costs a fifth of five.

const tool = readPage as unknown as {
  execute: (input: unknown, ctx: unknown) => Promise<string>;
};

let root = "";
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "read-page-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  const store = createWikiStore({ namespace: "t" });
  await store.write("profile.md", "# Profile\n", { etag: null });
  await store.write("entities/acme.md", "# Acme\n", { etag: null });
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

test("one path returns the Page as it is", async () => {
  assert.equal(
    await tool.execute({ paths: ["profile.md"] }, {}),
    "# Profile\n"
  );
});

test("several paths return every Page under its path, and name the missing one", async () => {
  const out = await tool.execute(
    { paths: ["profile.md", "/wiki/entities/acme.md", "entities/none.md"] },
    {}
  );
  assert.match(out, /=== profile\.md ===\n# Profile\n/);
  assert.match(out, /=== entities\/acme\.md ===\n# Acme\n/);
  assert.match(
    out,
    /=== entities\/none\.md ===\nNo Page at entities\/none\.md/
  );
});

test("a single missing Page or a Source path is an error", async () => {
  await assert.rejects(
    tool.execute({ paths: ["entities/none.md"] }, {}),
    /No Page/
  );
  await assert.rejects(
    tool.execute({ paths: ["sources/2026-01-01-x.md"] }, {}),
    /read_source/
  );
});

test("the retrieval cache reads as no Page, even when it exists", async () => {
  const store = createWikiStore({ namespace: "t" });
  await store.write("cache/embeddings.json", "{}", { etag: null });
  await store.write("cache/notes.md", "# hidden\n", { etag: null });
  await assert.rejects(
    tool.execute({ paths: ["cache/embeddings.json"] }, {}),
    /No Page at cache\/embeddings\.json/
  );
  const out = await tool.execute(
    { paths: ["profile.md", "/wiki/cache/notes.md"] },
    {}
  );
  assert.match(out, /=== cache\/notes\.md ===\nNo Page at cache\/notes\.md/);
  assert.doesNotMatch(out, /hidden/);
});
