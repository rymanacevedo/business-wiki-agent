import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { gatewayEmbed } from "../../../packages/wiki-retrieval/gateway";
import { retrieval, retrievalEmbed } from "../config";
import { EVAL_RUN_ENV } from "../eval-wiki";

// The agent keeps one Retrieval instance per namespace, so its memo outlives
// the fresh store each tool call builds; at most the 8 most recently used.

let root = "";
const saved = { ...process.env };
const session = (id: string) => ({ session: { id } });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "retrieval-instance-test-"));
  process.env.WIKI_STORE_DIR = root;
  delete process.env[EVAL_RUN_ENV];
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

test("one instance per namespace", () => {
  process.env.WIKI_NAMESPACE = "a";
  const a = retrieval();
  assert.equal(retrieval(), a);
  process.env.WIKI_NAMESPACE = "b";
  assert.notEqual(retrieval(), a);
});

test("each eval session gets its own instance", () => {
  process.env[EVAL_RUN_ENV] = "run-1";
  const a = retrieval(session("sess_a"));
  assert.equal(retrieval(session("sess_a")), a);
  assert.notEqual(retrieval(session("sess_b")), a);
});

test("only the 8 most recently used instances are kept", () => {
  process.env[EVAL_RUN_ENV] = "run-2";
  const first = retrieval(session("s0"));
  const second = retrieval(session("s1"));
  for (let i = 2; i < 8; i++) retrieval(session(`s${i}`));
  assert.equal(
    retrieval(session("s0")),
    first,
    "s0 used again: now most recent"
  );
  retrieval(session("s8")); // evicts s1, the least recently used
  assert.equal(retrieval(session("s0")), first);
  assert.notEqual(retrieval(session("s1")), second);
});

test("retrieval is lexical-only unless CLERK_RETRIEVAL_EMBEDDINGS=1 (the after runs cut embeddings)", () => {
  delete process.env.CLERK_RETRIEVAL_EMBEDDINGS;
  assert.equal(retrievalEmbed(), undefined);
  process.env.CLERK_RETRIEVAL_EMBEDDINGS = "0";
  assert.equal(retrievalEmbed(), undefined);
  process.env.CLERK_RETRIEVAL_EMBEDDINGS = "true";
  assert.equal(retrievalEmbed(), undefined);
  process.env.CLERK_RETRIEVAL_EMBEDDINGS = "1";
  assert.equal(retrievalEmbed(), gatewayEmbed);
  delete process.env.CLERK_RETRIEVAL_EMBEDDINGS;
});
