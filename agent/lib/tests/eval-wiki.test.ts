import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { wiki } from "../config";
import { EVAL_RUN_ENV, evalNamespace } from "../eval-wiki";

let root: string;
const saved = { ...process.env };
const session = (id: string) => ({ session: { id } });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "clerk-eval-wiki-"));
  process.env.WIKI_STORE_DIR = root;
  process.env[EVAL_RUN_ENV] = "run-1";
  process.env.WIKI_SEED = "base";
});

afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

test("under an eval run each session gets its own namespace, seeded on first access", async () => {
  const dir = join(root, "eval/run-1/sess_a");
  assert.equal(
    existsSync(dir),
    false,
    "nothing is copied before the first access"
  );

  const index = await wiki(session("sess_a")).read("index.md");

  assert.equal(index?.body, readFileSync("fixtures/base/index.md", "utf8"));
  assert.ok(
    existsSync(join(dir, "sources/2026-08-03-receipt-harbor-hardware.txt"))
  );
  assert.equal(evalNamespace("run-1", "sess_a"), "eval/run-1/sess_a");
});

test("sessions in one run do not see each other's writes", async () => {
  const a = wiki(session("sess_a"));
  const b = wiki(session("sess_b"));
  const before = await a.read("log.md");
  await a.write("log.md", `${before!.body}- 2026-10-17 LINT: test\n`, {
    etag: before!.etag,
  });

  assert.match((await a.read("log.md"))!.body, /LINT: test/);
  assert.doesNotMatch((await b.read("log.md"))!.body, /LINT: test/);
});

test("concurrent first accesses seed once and keep later writes", async () => {
  const store = wiki(session("sess_c"));
  const [first, second] = await Promise.all([
    store.list("summaries/"),
    store.read("profile.md"),
  ]);
  assert.ok(first.length > 0 && second);
  await store.write("entities/new.md", "x", { etag: null });

  assert.deepEqual(await wiki(session("sess_c")).list("entities/new"), [
    "entities/new.md",
  ]);
});

test("the seed comes from WIKI_SEED", async () => {
  process.env.WIKI_SEED = "full";
  const summaries = await wiki(session("sess_full")).list("summaries/");
  assert.ok(summaries.includes("summaries/2024-10-21-ein-letter.md"));

  process.env.WIKI_SEED = "nope";
  await assert.rejects(
    async () => wiki(session("sess_bad")).read("index.md"),
    /WIKI_SEED/
  );
});

test("outside an eval run the namespace is WIKI_NAMESPACE, never seeded", async () => {
  delete process.env[EVAL_RUN_ENV];
  process.env.WIKI_NAMESPACE = "plain";

  assert.equal(await wiki(session("sess_a")).read("index.md"), null);
  assert.equal(existsSync(join(root, "eval")), false);
});

test("an eval run with no session to name the namespace refuses", async () => {
  await assert.rejects(async () => wiki().read("index.md"), /session/);
});
