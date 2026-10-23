import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { WRITE_TOOLS } from "../../../evals/lib/answers";
import { seedNamespace } from "../../../packages/wiki-store/seed";
import lint from "../../skills/lint";
import readPage from "../../tools/read_page";
import { READ_PAGE_MAX, wiki } from "../config";
import listFlagged from "../../tools/list_flagged";

// list_flagged is Lint's exhaustive flag scan: every Page carrying the flag,
// one line each, never ranked or capped.

const tool = listFlagged as unknown as {
  inputSchema: { safeParse: (input: unknown) => { success: boolean } };
  execute: (input: unknown, ctx: unknown) => Promise<string>;
};

let root = "";
let sources = "";
const saved = { ...process.env };
before(async () => {
  root = mkdtempSync(join(tmpdir(), "list-flagged-test-"));
  sources = mkdtempSync(join(tmpdir(), "list-flagged-sources-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  delete process.env.CLERK_EVAL_RUN;
  await seedNamespace({
    namespace: "t",
    fixtureDir: resolve("fixtures/full"),
    sourcesDir: sources,
  });
});
after(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
  rmSync(sources, { recursive: true, force: true });
});

test("one line per flagged Page: path · kind · status", async () => {
  assert.equal(
    await tool.execute({ flag: "conflict" }, {}),
    "profile.md · profile · active"
  );
  assert.equal(
    await tool.execute({ flag: "suspicious-content" }, {}),
    "summaries/2026-10-02-invoice-eastside-auto-3381.md · summary · active"
  );
});

test("no flagged Page says so; flagged Pages past five are all listed, by path", async () => {
  assert.equal(
    await tool.execute({ flag: "needs-owner" }, {}),
    "No Page carries the flag needs-owner."
  );
  const store = wiki();
  for (const name of ["f", "b", "e", "a", "d", "c"])
    await store.write(
      `entities/${name}.md`,
      `---\ntitle: ${name}\nkind: entity\nstatus: active\nflags: [needs-owner]\n---\n\n${name}\n`,
      { etag: null }
    );
  assert.equal(
    await tool.execute({ flag: "needs-owner" }, {}),
    ["a", "b", "c", "d", "e", "f"]
      .map((name) => `entities/${name}.md · entity · active`)
      .join("\n")
  );
});

test("a flagged scaffolding Page is listed like any other", async () => {
  const store = wiki();
  const index = await store.read("index.md");
  assert.ok(index);
  await store.write(
    "index.md",
    index.body.replace("flags: []", "flags: [conflict]"),
    { etag: index.etag }
  );
  assert.equal(
    await tool.execute({ flag: "conflict" }, {}),
    "index.md · index · active\nprofile.md · profile · active"
  );
  const flagged = await store.read("index.md");
  assert.ok(flagged);
  await store.write("index.md", index.body, { etag: flagged.etag });
  assert.equal(
    await tool.execute({ flag: "conflict" }, {}),
    "profile.md · profile · active"
  );
});

test("flag takes only the Schema's three flags", () => {
  for (const flag of ["conflict", "suspicious-content", "needs-owner"])
    assert.equal(tool.inputSchema.safeParse({ flag }).success, true);
  for (const flag of ["Conflict", "stale", ""])
    assert.equal(tool.inputSchema.safeParse({ flag }).success, false);
});

test("list_flagged is a read tool: in no write-tool list", () => {
  assert.ok(readdirSync(resolve("agent/tools")).includes("list_flagged.ts"));
  assert.equal(WRITE_TOOLS.includes("list_flagged"), false);
});

test("Lint reads a flagged list longer than read_page's cap in several calls", async () => {
  const read = readPage as unknown as {
    inputSchema: { safeParse: (input: unknown) => { success: boolean } };
  };
  const paths = (n: number) =>
    Array.from({ length: n }, (_, i) => `entities/p${i}.md`);
  assert.equal(
    read.inputSchema.safeParse({ paths: paths(READ_PAGE_MAX) }).success,
    true
  );
  assert.equal(
    read.inputSchema.safeParse({ paths: paths(READ_PAGE_MAX + 1) }).success,
    false
  );
  const { markdown } = lint as unknown as { markdown: string };
  for (const step of ["2. **Unresolved", "3. **Suspicious"]) {
    const text = markdown.slice(markdown.indexOf(step)).split(/\n\d\. /)[0];
    assert.match(text, /list_flagged/);
    assert.ok(
      text.includes(`at most ${READ_PAGE_MAX} paths a call`),
      `${step} batches its reads`
    );
  }
});
