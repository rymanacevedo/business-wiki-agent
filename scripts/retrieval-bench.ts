// The offline retrieval bench (ticket #60): seed a temporary local namespace
// from fixtures/full (embedding cache included), run wiki-retrieval over every
// Query row with `cites` across the configurations, print the table and write
// docs/evals/retrieval-bench.md.
// Usage: bun run bench:retrieval [--lexical]
// Hybrid when fixtures/full has its embedding cache: query vectors come from
// the Gateway (AI_GATEWAY_API_KEY in .env.local). `--lexical` runs without
// the embedding Rung, for when embeddings are cut, and the table says so.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { format } from "prettier";
import { loadQueryCases } from "../evals/query/cases";
import {
  CACHE_PATH,
  EMBEDDING_MODEL,
  type Embed,
} from "../packages/wiki-retrieval";
import { gatewayEmbed } from "../packages/wiki-retrieval/gateway";
import { createWikiStore } from "../packages/wiki-store";
import { seedNamespace } from "../packages/wiki-store/seed";
import { benchRows, renderBench, runBench } from "./lib/retrieval-bench";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = join(ROOT, "fixtures/full");
const OUT = join(ROOT, "docs/evals/retrieval-bench.md");

/** The Gateway adapter, each distinct text embedded once per run. */
function memoised(embed: Embed): Embed {
  const seen = new Map<string, number[]>();
  return async (texts) => {
    const todo = [...new Set(texts.filter((t) => !seen.has(t)))];
    if (todo.length > 0) {
      const vectors = await embed(todo);
      todo.forEach((t, i) => seen.set(t, vectors[i]!));
    }
    return texts.map((t) => seen.get(t)!);
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { lexical: { type: "boolean", default: false } },
  });
  const hybrid = !values.lexical && existsSync(join(FIXTURE, CACHE_PATH));
  const root = mkdtempSync(join(tmpdir(), "retrieval-bench-"));
  const sources = mkdtempSync(join(tmpdir(), "retrieval-bench-sources-"));
  try {
    const env = { WIKI_STORE_DIR: root };
    await seedNamespace({
      namespace: "bench",
      fixtureDir: FIXTURE,
      sourcesDir: sources,
      env,
    });
    const store = createWikiStore({ namespace: "bench", env });
    const rows = benchRows(
      await loadQueryCases(join(ROOT, "evals/query/questions.yaml"))
    );
    const report = await runBench({
      store,
      rows,
      ...(hybrid ? { embed: memoised(gatewayEmbed) } : {}),
    });
    // Formatted as the commit hook would, so a rerun diffs clean.
    const doc = await format(
      renderBench(report, {
        fixture: "`fixtures/full`",
        model: EMBEDDING_MODEL,
      }),
      { parser: "markdown" }
    );
    writeFileSync(OUT, doc);
    console.log(doc);
    console.log(`Wrote ${OUT}`);
    return 0;
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(sources, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code));
