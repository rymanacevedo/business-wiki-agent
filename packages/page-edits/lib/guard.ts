import { paymentBlock, splitPage, topLevelKeys } from "./frontmatter";

/** An edit that would alter an Established Fact outside `change_fact`. */
export class EstablishedFactError extends Error {
  constructor(path: string, what: string) {
    super(
      `update_page cannot change ${what} on ${path}: it is an Established Fact. ` +
        "Propose the change with change_fact (page, old value, new value, Source, reason) and wait for the Owner's Approval."
    );
    this.name = "EstablishedFactError";
  }
}

const same = (a: string[] | null, b: string[] | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Throws EstablishedFactError when replacing `before` with `after` at `path`
 * would alter an Established Fact. Writing a fact for the first time is free.
 */
export function guardPageEdit(
  path: string,
  before: string,
  after: string
): void {
  const old = splitPage(before);
  const next = splitPage(after);
  const oldPayment = paymentBlock(old.frontmatter);
  if (oldPayment && !same(oldPayment, paymentBlock(next.frontmatter)))
    throw new EstablishedFactError(path, "the expense.payment block");

  const kind = pageKind(path, old.frontmatter);
  if (!kind) return;

  if (kind === "obligation") {
    const before = topLevelKeys(old.frontmatter);
    const now = topLevelKeys(next.frontmatter);
    for (const key of OBLIGATION_KEYS)
      if (before.get(key) !== now.get(key))
        throw new EstablishedFactError(path, `the Obligation's ${key}`);
  }

  const remaining = new Map<string, number>();
  for (const line of factLines(next.body))
    remaining.set(line, (remaining.get(line) ?? 0) + 1);
  for (const line of factLines(old.body)) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) {
      remaining.set(line, count - 1);
      continue;
    }
    if (PLACEHOLDER.test(line) || keptInConflict(line, next.body)) continue;
    throw new EstablishedFactError(path, `the fact line "${line}"`);
  }
}

/** Frontmatter keys that are Established Facts on an Obligation Page. */
const OBLIGATION_KEYS = [
  "obligation",
  "due",
  "counterparty",
  "recurs",
  "status",
  "superseded_by",
  "done_on",
];

/** Bullet lines of a Profile or Obligation body, trimmed. */
function factLines(body: string[]): string[] {
  return body
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function pageKind(
  path: string,
  frontmatter: string[]
): "profile" | "obligation" | null {
  const kind = topLevelKeys(frontmatter).get("kind");
  if (path === "profile.md" || kind === "profile") return "profile";
  if (path.startsWith("obligations/") || kind === "obligation")
    return "obligation";
  return null;
}

/** A fact line that records an absence; filling it in is a first write. */
const PLACEHOLDER = /not in the wiki/i;

/**
 * A Contradiction may replace a fact line when the new line keeps the same
 * label, is marked `**Conflict**`, and still carries the first recorded value
 * with its Citation verbatim.
 */
function keptInConflict(line: string, body: string[]): boolean {
  const match = /^- (\*\*[^*]+\*\*):\s*(.+)$/.exec(line);
  if (!match) return false;
  const [, label, value] = match;
  return body
    .map((next) => next.trim())
    .some(
      (next) =>
        next.startsWith(`- ${label}:`) &&
        next.includes("**Conflict**") &&
        next.includes(value)
    );
}
