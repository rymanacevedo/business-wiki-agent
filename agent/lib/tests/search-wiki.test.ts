import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { seedNamespace } from "../../../packages/wiki-store/seed";
import searchWiki from "../../tools/search_wiki";

// search_wiki returns the structure evals and traces read, and the model
// sees only the rendered text.

type Output = {
  rung: string;
  hopRan: boolean;
  matches: string[];
  neighbours: string[];
  text: string;
};
const tool = searchWiki as unknown as {
  inputSchema: { safeParse: (input: unknown) => { success: boolean } };
  execute: (input: unknown, ctx: unknown) => Promise<Output>;
  toModelOutput: (output: Output) => { type: string; value: unknown };
};

let root = "";
let sources = "";
const saved = { ...process.env };
before(async () => {
  root = mkdtempSync(join(tmpdir(), "search-wiki-test-"));
  sources = mkdtempSync(join(tmpdir(), "search-wiki-sources-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  delete process.env.CLERK_EVAL_RUN;
  // Lexical-only: these tests never call the Gateway. The package's tests
  // cover the embedding Rung with a fake adapter.
  process.env.CLERK_RETRIEVAL_EMBEDDINGS = "0";
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

test("the cash purchases come back as Matches, in Variant A, with no score or Rung in the text", async () => {
  const output = await tool.execute(
    { query: "Which purchases did we pay in cash?" },
    {}
  );
  assert.equal(output.rung, "lexical");
  assert.equal(output.hopRan, false);
  assert.deepEqual(output.neighbours, []);
  assert.ok(
    output.matches.includes("summaries/2026-08-22-receipt-dockside-deli.md")
  );
  assert.ok(
    output.matches.includes(
      "summaries/2026-09-12-invoice-cascade-parts-4472.md"
    )
  );
  assert.match(output.text, /^## Matches \(\d\)\n### /);
  assert.match(output.text, /> - \*\*Payment\*\*: CASH 20\.00/);
  assert.doesNotMatch(output.text, /lexical|score|\d\.\d{3}/);
  assert.deepEqual(tool.toModelOutput(output), {
    type: "text",
    value: output.text,
  });
});

test("kind narrows the Matches and takes only the Schema's Page kinds", async () => {
  const output = await tool.execute(
    { query: "What do we owe Cascade Appliance Parts?", kind: "obligation" },
    {}
  );
  assert.deepEqual(output.matches, [
    "obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md",
  ]);
  assert.equal(
    tool.inputSchema.safeParse({ query: "x", kind: "ledger" }).success,
    true
  );
  assert.equal(
    tool.inputSchema.safeParse({ query: "x", kind: "index" }).success,
    false
  );
  assert.equal(
    tool.inputSchema.safeParse({ query: "x", kind: "invoice" }).success,
    false
  );
});

test("nothing found says so", async () => {
  const output = await tool.execute({ query: "zzqqxx" }, {});
  assert.deepEqual(output.matches, []);
  assert.equal(output.text, "No Page matches the query.");
});

test("CLERK_RETRIEVAL_GRAPH_RAG=1, and only 1, turns the hop on", async () => {
  const query = "Which purchases did the August bank statement confirm?";
  try {
    for (const value of [undefined, "0", "true", ""]) {
      if (value === undefined) delete process.env.CLERK_RETRIEVAL_GRAPH_RAG;
      else process.env.CLERK_RETRIEVAL_GRAPH_RAG = value;
      const off = await tool.execute({ query }, {});
      assert.equal(off.hopRan, false, `value ${value}`);
      assert.deepEqual(off.neighbours, []);
      assert.doesNotMatch(off.text, /Also linked/);
    }
    process.env.CLERK_RETRIEVAL_GRAPH_RAG = "1";
    const on = await tool.execute({ query }, {});
    assert.equal(on.hopRan, true);
    assert.equal(on.matches.length + on.neighbours.length, 8);
    assert.ok(
      on.matches.includes("summaries/2026-08-31-bank-statement-tidewater.md")
    );
    assert.match(
      on.text,
      new RegExp(`\\n## Also linked \\(${on.neighbours.length}\\)\\n- `)
    );
  } finally {
    delete process.env.CLERK_RETRIEVAL_GRAPH_RAG;
  }
});
