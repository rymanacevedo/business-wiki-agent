import { defineEval } from "eve/evals";
import { checkLint } from "../../packages/answer-checks";
import type config from "../evals.config";
import { gateChecks, WRITE_TOOLS } from "../lib/answers";
import { drive } from "../lib/drive";
import { lintCases } from "./cases";

// Slice `lint`: eval-design item 14, deterministic only. Run with WIKI_SEED=full.
// Lint writes nothing but its LINT Log line, so no write tool is called.
export default lintCases.map((c) =>
  defineEval<typeof config>({
    description: c.description,
    tags: c.tags,
    metadata: { caseId: c.caseId },
    async test(t) {
      if (t.context.seed !== "full")
        t.skip("the Lint slice runs from WIKI_SEED=full");

      const turn = await drive(t, c.caseId, c.prompt);
      turn.succeeded();
      for (const tool of WRITE_TOOLS) t.notCalledTool(tool);
      gateChecks(t, checkLint(c.expect, turn.message ?? ""));
    },
  })
);
