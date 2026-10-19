import {
  checkAnswer,
  describe,
  excludes,
  includes,
  type AnswerExpectation,
  type Check,
  type Pattern,
} from "./answer";

/** The five fixed Lint sections, in report order (spec #15, story 31). */
export const LINT_SECTIONS = [
  "Unresolved Contradictions",
  "Suspicious Content",
  "Missed Obligations",
  "Due within 30 days",
  "Orphan Pages",
] as const;

export type LintSection = (typeof LINT_SECTIONS)[number];

export type SectionExpectation = {
  must_include?: readonly Pattern[];
  must_not_include?: readonly Pattern[];
  /** The section lists no item (says "None."). */
  empty?: boolean;
};

/**
 * A Lint row: patterns over the whole answer and, for a full Lint, per-section
 * patterns. Rows with `sections` also require all five headers, in order.
 */
export type LintExpectation = Omit<AnswerExpectation, "cites"> & {
  sections?: Partial<Record<LintSection, SectionExpectation>>;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A header line: optional `#`s or a number, optional bold, then the name
 * ("Obligations due within 30 days", the spec's wording, also counts).
 */
const header = (name: string) =>
  new RegExp(
    `^[ \\t]*(?:#{1,6}[ \\t]+|\\d+[.)][ \\t]+)?(?:\\*\\*|__)?[ \\t]*(?:obligations[ \\t]+)?${escape(name).replace(/ /g, "\\s+")}\\b.*$`,
    "im"
  );

type Part = { start: number; text: string };

/** Each section's header offset and text (header line excluded); null when the header is missing. */
function splitSections(answer: string): Map<LintSection, Part | null> {
  const found = LINT_SECTIONS.map((name) => {
    const m = header(name).exec(answer);
    return {
      name,
      start: m ? m.index : -1,
      body: m ? m.index + m[0].length : -1,
    };
  });
  const starts = found.filter((f) => f.start >= 0).map((f) => f.start);
  return new Map(
    found.map(({ name, start, body }) => {
      if (start < 0) return [name, null];
      const end = Math.min(answer.length, ...starts.filter((s) => s > start));
      return [name, { start, text: answer.slice(body, end) }];
    })
  );
}

const LINKED = /\]\(|\(src:/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$/;

/** No link or Citation, and no list item other than "None". */
function isEmpty(text: string): boolean {
  if (LINKED.test(text)) return false;
  return text.split("\n").every((line) => {
    const item = LIST_ITEM.exec(line);
    return !item || /^\W*none\b/i.test(item[1]!);
  });
}

/**
 * The deterministic checks on a Lint answer: with `sections`, one check per
 * header present and one for their order; then the whole-answer patterns;
 * then each section's patterns. A missing section fails all of its checks.
 */
export function checkLint(
  expectation: LintExpectation,
  answer: string
): Check[] {
  const checks: Check[] = [];
  const { sections } = expectation;
  const parts = splitSections(answer);
  if (sections) {
    for (const name of LINT_SECTIONS) {
      const passed = parts.get(name) !== null;
      checks.push(
        passed
          ? { name: `section ${name}`, passed }
          : { name: `section ${name}`, passed, detail: "header not found" }
      );
    }
    const order = LINT_SECTIONS.flatMap((n) => parts.get(n)?.start ?? []);
    const passed = order.every((at, i) => i === 0 || at > order[i - 1]!);
    checks.push({ name: "sections in order", passed });
  }
  checks.push(...checkAnswer(expectation, answer));
  for (const name of LINT_SECTIONS) {
    const want = sections?.[name];
    if (!want) continue;
    const text = parts.get(name)?.text ?? null;
    const missing = (check: string): Check => ({
      name: check,
      passed: false,
      detail: "section missing",
    });
    for (const p of want.must_include ?? []) {
      const check = `${name} includes ${describe(p)}`;
      checks.push(text === null ? missing(check) : includes(check, p, text));
    }
    for (const p of want.must_not_include ?? []) {
      const check = `${name} excludes ${describe(p)}`;
      checks.push(text === null ? missing(check) : excludes(check, p, text));
    }
    if (want.empty) {
      const check = `${name} empty`;
      checks.push(
        text === null
          ? missing(check)
          : isEmpty(text)
            ? { name: check, passed: true }
            : { name: check, passed: false, detail: text.trim().slice(0, 200) }
      );
    }
  }
  return checks;
}
