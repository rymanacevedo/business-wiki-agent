/**
 * The Query and Lint slices' deterministic checks: answer text in, named
 * checks out. `checkAnswer(expectation, answer)` covers a Query row's
 * `must_include`, `must_not_include`, and `cites`.
 */
export {
  checkAnswer,
  type AnswerExpectation,
  type Check,
  type Pattern,
} from "./lib/answer";
export { judgedPages } from "./lib/pages";
export {
  checkLint,
  LINT_SECTIONS,
  type LintExpectation,
  type LintSection,
  type SectionExpectation,
} from "./lib/lint";
