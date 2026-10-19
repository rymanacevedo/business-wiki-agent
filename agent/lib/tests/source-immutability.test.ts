import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import appendLog from "../../tools/append_log";
import changeFact from "../../tools/change_fact";
import createPage from "../../tools/create_page";
import updatePage from "../../tools/update_page";

// Source immutability (spec #15: a unit test, not an eval row). Sources are
// written once by the seed script; no tool Clerk has can change, replace, or
// delete one, whatever path it is given.

const ID = "2026-02-20-w9-northwind";
const SOURCE = `sources/${ID}.md`;
const BODY = "W-9\nSocial security number: 512-40-6789\n";

type Tool = { execute: (input: unknown, ctx: unknown) => Promise<unknown> };
async function run(tool: unknown, input: unknown): Promise<string> {
  try {
    return String(await (tool as Tool).execute(input, { messages: [] }));
  } catch (error) {
    return `refused: ${(error as Error).message}`;
  }
}

let root = "";
let file = "";
const saved = { ...process.env };
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "source-immutability-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  delete process.env.CLERK_EVAL_RUN;
  mkdirSync(join(root, "t", "sources"), { recursive: true });
  file = join(root, "t", SOURCE);
  writeFileSync(file, BODY);
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const sourceFiles = () => readdirSync(join(root, "t", "sources")).sort();

test("create_page cannot overwrite a Source or add a file under sources/", async () => {
  for (const path of [SOURCE, "sources/forged.md", "./sources/forged.md"]) {
    const result = await run(createPage, {
      path,
      content: "---\nkind: summary\n---\nforged\n",
    });
    assert.match(result, /^refused: /, path);
  }
  assert.equal(readFileSync(file, "utf8"), BODY);
  assert.deepEqual(sourceFiles(), [`${ID}.md`]);
});

test("update_page cannot edit a Source", async () => {
  const result = await run(updatePage, {
    path: SOURCE,
    edits: [{ find: "512-40-6789", replace: "000-00-0000" }],
  });
  assert.match(result, /^refused: /);
  assert.equal(readFileSync(file, "utf8"), BODY);
});

test("change_fact, even approved, cannot rewrite a Source", async () => {
  const result = await run(changeFact, {
    changes: [{ page: SOURCE, old_value: "512-40-6789", new_value: "x" }],
    source: "owner statement",
    reason: "test",
  });
  assert.match(result, /^refused: /);
  assert.equal(readFileSync(file, "utf8"), BODY);
});

test("append_log writes only the Log, never a Source", async () => {
  await run(appendLog, {
    type: "MILESTONE",
    subject: SOURCE,
    detail: "forged",
  });
  assert.equal(readFileSync(file, "utf8"), BODY);
  assert.deepEqual(sourceFiles(), [`${ID}.md`]);
});

test("Clerk has no tool that deletes or moves anything", () => {
  const tools = readdirSync(resolve(__dirname, "../../tools"));
  assert.deepEqual(
    tools.filter((name) => /delete|remove|move|rename|unlink/i.test(name)),
    []
  );
});
