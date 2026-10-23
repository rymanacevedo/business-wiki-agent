/**
 * The Query and Lint slices' deterministic checks: answer text in, named
 * checks out. `checkAnswer(expectation, answer)` covers a Query row's
 * `must_include`, `must_not_include`, and `cites`; `retrievalMetrics(cites,
 * toolCalls)` scores what `search_wiki` returned against the same `cites`;
 * `matches(pattern, text)` is the pattern rule they share, and `citesPath(pattern,
 * path)` resolves a `cites` entry against one result path.
 */
export {
  checkAnswer,
  type AnswerExpectation,
  type Check,
  matches,
  type Pattern,
} from "./lib/answer";
export { judgedPages } from "./lib/pages";
export {
  citesPath,
  retrievalMetrics,
  type RetrievalMetrics,
  type ToolCallOutput,
} from "./lib/retrieval";
export {
  checkLint,
  LINT_SECTIONS,
  type LintExpectation,
  type LintSection,
  type SectionExpectation,
} from "./lib/lint";
