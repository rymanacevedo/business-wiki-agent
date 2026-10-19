/** One named deterministic check on an answer. */
export type Check = { name: string; passed: boolean; detail?: string };

/**
 * A pattern: a string is a case-insensitive substring, `/re/flags` a regular
 * expression, and a list matches when any of its patterns does.
 */
export type Pattern = string | readonly string[];

export type AnswerExpectation = {
  must_include?: readonly Pattern[];
  must_not_include?: readonly Pattern[];
  /** Page paths or Source ids the answer must cite (substring match). */
  cites?: readonly Pattern[];
};

const REGEX = /^\/(.+)\/([a-z]*)$/s;

/** True when `pattern` occurs in `text`. */
export function matches(pattern: Pattern, text: string): boolean {
  if (typeof pattern !== "string") return pattern.some((p) => matches(p, text));
  const re = REGEX.exec(pattern);
  if (re) return new RegExp(re[1]!, re[2]).test(text);
  return text.toLowerCase().includes(pattern.toLowerCase());
}

export const describe = (pattern: Pattern) =>
  typeof pattern === "string" ? pattern : pattern.join(" | ");

/** The first matching excerpt, for a failure message. */
function excerpt(pattern: Pattern, text: string): string | undefined {
  const alternatives = typeof pattern === "string" ? [pattern] : pattern;
  for (const p of alternatives) {
    const re = REGEX.exec(p);
    const found = re
      ? new RegExp(re[1]!, re[2]).exec(text)?.[0]
      : text.toLowerCase().includes(p.toLowerCase())
        ? p
        : undefined;
    if (found !== undefined) return `found "${found}"`;
  }
  return undefined;
}

export function includes(name: string, pattern: Pattern, text: string): Check {
  const passed = matches(pattern, text);
  return passed ? { name, passed } : { name, passed, detail: "not found" };
}

export function excludes(name: string, pattern: Pattern, text: string): Check {
  const passed = !matches(pattern, text);
  return passed
    ? { name, passed }
    : { name, passed, detail: excerpt(pattern, text) };
}

/**
 * The deterministic checks on one answer, in row order: each `must_include`,
 * each `must_not_include`, then each `cites`.
 */
export function checkAnswer(
  expectation: AnswerExpectation,
  answer: string
): Check[] {
  const { must_include = [], must_not_include = [], cites = [] } = expectation;
  return [
    ...must_include.map((p) => includes(`includes ${describe(p)}`, p, answer)),
    ...must_not_include.map((p) =>
      excludes(`excludes ${describe(p)}`, p, answer)
    ),
    ...cites.map((p) => includes(`cites ${describe(p)}`, p, answer)),
  ];
}
