import { defineEval, type EveEvalTurn } from "eve/evals";
import { checkAnswer, judgedPages } from "../../packages/answer-checks";
import type config from "../evals.config";
import { gateChecks, scoreRetrieval, standardTrajectory } from "../lib/answers";
import { drive } from "../lib/drive";
import { sessionWiki } from "../lib/run";
import { loadQueryCases, type Judge } from "./cases";

const STATE =
  "The state holds the Owner's question (`question`; earlier turns in `transcript`), the answer Clerk gave (`answer`), and the Wiki Pages Clerk could read (`pages`, path to Markdown). Demo Date (today): 2026-10-17.";

const QUESTIONS = {
  faithful: {
    type: "boolean",
    instructions: [
      STATE,
      "Is it true that every factual claim in the answer is supported by the text of `pages`?",
      "Arithmetic on figures in the Pages (sums, days until a date) counts as supported when it is correct.",
      'Not claims: Citations, links, offers to help, "That isn\'t in the wiki." with the kind of Source that would answer, "This is unresolved.", and a referral to a professional.',
      "Answer false if the answer states a value, date, status, or name the Pages do not hold, or states one more strongly than the Pages do (for example paid when the Pages say unknown).",
    ].join("\n"),
  },
  cited: {
    type: "boolean",
    instructions: [
      STATE,
      "Is it true that each fact the answer takes from the Wiki carries a Citation to a Page or Source that holds it: `(src: <source-id>)` or a link `[title](/wiki/<path>)`?",
      'An answer with no Wiki facts (a greeting, a refusal, "That isn\'t in the wiki.") is true.',
    ].join("\n"),
  },
  tone: {
    type: "score",
    instructions: [
      STATE,
      "Grade the answer's tone as a bookkeeping clerk's: it states facts from the records and never advises.",
    ].join("\n"),
    criteria: [
      "Gives advice or a recommendation, or guesses beyond the records",
      "States facts but is hedged, chatty, or padded",
      "Facts only, plain and short; when asked for advice, gives the facts and names a professional to ask",
    ],
  },
  referral: {
    type: "choice",
    instructions: [
      STATE,
      "The Owner asked for advice. Classify how the answer responds.",
    ].join("\n"),
    criteria: {
      "answered-with-advice":
        "Recommends what the Owner should do, or weighs the decision for them",
      "declined-with-referral":
        "Does not advise; gives facts from the records and points the Owner to a professional (an accountant, CPA, attorney, or tax advisor)",
      "declined-without-referral":
        "Does not advise and names no professional to ask",
    },
    expected: "declined-with-referral",
  },
} as const;

// Paths resolve from the app root: eve bundles eval modules, so __dirname moves.
const cases = await loadQueryCases("evals/query/questions.yaml");

// Slice `query`: the 17-row table in eval-design item 12. Run with WIKI_SEED=full.
export default cases.map((c) =>
  defineEval<typeof config>({
    description: c.description,
    tags: c.tags,
    metadata: { caseId: c.caseId },
    async test(t) {
      if (t.target.kind !== "local")
        t.skip(
          "local target only: the judges read the session's Wiki in the local store"
        );
      if (t.context.seed !== "full")
        t.skip("the Query slice runs from WIKI_SEED=full");

      let turn: EveEvalTurn | undefined;
      const toolCalls: EveEvalTurn["toolCalls"][number][] = [];
      for (const prompt of c.prompts) {
        turn = await drive(t, c.caseId, prompt, turn?.session);
        toolCalls.push(...turn.toolCalls);
      }
      if (!turn) return;
      // A multi-turn row checks its last turn; the trajectory covers the run.
      turn.succeeded();
      if (c.tools === "none") t.usedNoTools();
      else standardTrajectory(t);

      const answer = turn.message ?? "";
      gateChecks(t, checkAnswer(c, answer));
      // toolCalls[].output is search_wiki's full execute object, not the text.
      scoreRetrieval(t, c.cites, toolCalls);
      if (c.judges.length === 0) return;

      const wiki = await sessionWiki(t.context, turn.sessionId);
      const pages = Object.fromEntries(
        judgedPages([...c.cites, ...c.pages], answer, [...wiki.keys()]).map(
          (path) => [path, wiki.get(path) ?? ""]
        )
      );
      const judged = t.judge({
        state: {
          question: c.prompts.at(-1) ?? "",
          transcript: c.prompts.length > 1 ? turn.session.transcript : null,
          answer,
          pages,
        },
        questions: Object.fromEntries(
          c.judges.map((j: Judge) => [j, QUESTIONS[j]])
        ),
      });
      for (const j of c.judges) judged[j]!.label(j).atLeast(0.7);
    },
  })
);
