import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineEval } from "eve/evals";
import { loadCorpus } from "../../packages/corpus";
import { checkIngest } from "../../packages/ingest-expectations";
import { maskSource } from "../../packages/source-masking";
import type config from "../evals.config";
import { drive } from "../lib/drive";
import { seedWiki, sessionWiki } from "../lib/run";
import { ingestCases } from "./cases";

const INGEST_TIMEOUT_MS = 240_000;

const PAGE_FAITHFUL = [
  "The state holds a document (`source`, already masked) and the summary Page a bookkeeping assistant wrote for it (`summary`).",
  "Is it true that the summary states nothing the source does not support?",
  "Count only claims about the document: what it says, its parties, dates, amounts, items, terms, and numbers.",
  "Not claims, so never unfaithful: citations like (src: <id>), links to other Pages, frontmatter bookkeeping (title, kind, sources, created/updated dates, status, flags), and notes on how the assistant filed it (categories, duplicate or corroboration links, flags raised, a quoted instruction marked as suspicious).",
  "Masked numbers (***-**-1234, ****1234) match the source's masked form.",
  "If the summary is missing, answer false.",
].join("\n");

// Paths resolve from the app root: eve bundles eval modules, so __dirname moves.
const corpus = loadCorpus(resolve("corpus"));
const baseIngested = new Set(
  (await readdir(resolve("fixtures/base/summaries"))).map((f) =>
    f.replace(/\.md$/, "")
  )
);

// Slice `ingest`: one case per Source not in `base`, expectations from the
// Manifest. Run with WIKI_SEED=base.
export default ingestCases(corpus.manifest, baseIngested).map((c) =>
  defineEval<typeof config>({
    description: c.description,
    tags: c.tags,
    metadata: { caseId: c.caseId, sourceId: c.entry.id, trap: c.entry.trap },
    timeoutMs: INGEST_TIMEOUT_MS,
    async test(t) {
      if (t.target.kind !== "local")
        t.skip(
          "local target only: the checks read the session's Wiki in the local store"
        );
      if (t.context.seed !== "base")
        t.skip("the Ingest slice runs from WIKI_SEED=base");

      const turn = await drive(t, c.caseId, `Ingest ${c.entry.id}.`);
      if (c.expectsApproval) {
        t.parked();
        t.calledTool("change_fact", { status: "pending" });
      } else {
        turn.succeeded();
        t.notCalledTool("change_fact");
      }

      const after = await sessionWiki(t.context, turn.sessionId);
      const result = checkIngest(
        c.entry,
        { before: await seedWiki(t.context), after },
        { parked: c.expectsApproval }
      );
      for (const gate of result.gates)
        t.score({ score: gate.passed ? 1 : 0, message: gate.detail })
          .label(gate.name)
          .gate(1);
      const missed = result.extraction.checks.filter((check) => !check.passed);
      t.score({
        score: result.extraction.score,
        message: missed
          .map((m) => `${m.name}${m.detail ? `: ${m.detail}` : ""}`)
          .join("; "),
        metadata: { checks: result.extraction.checks },
      })
        .label("extraction")
        .atLeast(0.8);

      const source = maskSource(corpus.bodies.get(c.entry.file) ?? "");
      const summary = result.summary
        ? (after.get(result.summary) ?? null)
        : null;
      t.judge(
        { type: "boolean", instructions: PAGE_FAITHFUL },
        { on: { source, summary: summary ?? "(no summary Page)" } }
      )
        .label("page_faithful")
        .atLeast(0.7);
    },
  })
);
