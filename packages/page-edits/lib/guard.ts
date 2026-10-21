import {
  paymentBlock,
  samePayment,
  splitPage,
  topLevelKeys,
} from "./frontmatter";

/** The fact line a refused edit would change: its label and its claims. */
type Fact = { label: string; claims: string[] };

/** An edit that would alter an Established Fact outside `change_fact`. */
export class EstablishedFactError extends Error {
  constructor(path: string, what: string, fact?: Fact, hint = "") {
    const shape = fact
      ? `\`- ${fact.label}: ⚠ **Conflict**, unresolved since <Demo Date>: ${fact.claims.join(" or ")} or <new value> (src: <new source>)\``
      : "`- **Label**: ⚠ **Conflict**, unresolved since <Demo Date>: <current value> (src: <its source>) or <new value> (src: <new source>)`";
    super(
      `update_page cannot change ${what} on ${path}: it is an Established Fact. ${hint}` +
        "Propose the change with change_fact (page, old value, new value, Source, reason) and wait for the Owner's Approval. " +
        "If a new Source disagrees with this fact (a Contradiction, not a Supersession), do not use change_fact: rewrite the line in the Schema's Conflict shape, same label, keeping the current value and its Citation verbatim as one claim, word for word: " +
        `${shape}; that needs no Approval.`
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
  if (
    (oldPayment && !same(oldPayment, paymentBlock(next.frontmatter))) ||
    !samePayment(old.frontmatter, next.frontmatter)
  )
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

  guardFactLines(path, old.body, next.body);
}

/**
 * Every fact line of `before` must still be the current fact of its label in
 * its section of `after`: the same line, or a Conflict that keeps every claim
 * of it (see `keeps`). A copy elsewhere (under `## History`, in another
 * section, under another label) is not the current fact. New lines are first
 * writes, under a new label or an existing one (an Obligation's `**Record**`
 * gains a line per certificate). A placeholder (`not in the wiki`) may be
 * filled in. Bullets with no label (History lines, First recorded notes) must
 * survive somewhere on the Page.
 */
function guardFactLines(path: string, before: string[], after: string[]) {
  const old = readFacts(before);
  const now = readFacts(after);

  const remaining = new Map<string, number>();
  for (const line of now.unlabelled)
    remaining.set(line, (remaining.get(line) ?? 0) + 1);
  for (const line of old.unlabelled) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) remaining.set(line, count - 1);
    else if (!PLACEHOLDER.test(line))
      throw new EstablishedFactError(path, `the line "${line}"`);
  }

  for (const [key, lines] of old.facts) {
    const facts = lines.filter((fact) => !isPlaceholder(fact));
    if (facts.length === 0) continue;
    const next = now.facts.get(key) ?? [];
    const unmatched = [...next];
    for (const fact of facts) {
      const at = unmatched.findIndex((line) => line.text === fact.text);
      if (at !== -1) {
        unmatched.splice(at, 1);
        continue;
      }
      if (!next.some((line) => keeps(line, fact)))
        throw new EstablishedFactError(
          path,
          `the fact line "${fact.text}" under ${where(fact)}`,
          fact,
          "A fact line stays under its label in its section: a copy under `## History` or elsewhere does not keep it. "
        );
    }
  }
}

const where = (fact: FactLine) => fact.section || "the Page's top";

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

/** A labelled fact line: its section heading, label, value, and claims. */
type FactLine = Fact & { section: string; text: string; value: string };

/**
 * The body's bullets, trimmed: labelled fact lines keyed by section heading
 * and label, and unlabelled bullets. A section is the nearest heading below
 * the Page title (`##` or deeper), as written; above the first one it is "".
 */
function readFacts(body: string[]): {
  facts: Map<string, FactLine[]>;
  unlabelled: string[];
} {
  const facts = new Map<string, FactLine[]>();
  const unlabelled: string[] = [];
  let section = "";
  for (const raw of body) {
    const text = raw.trim();
    const heading = /^(#{1,6})(?:\s|$)/.exec(text);
    if (heading) {
      section = heading[1].length === 1 ? "" : text;
      continue;
    }
    if (!text.startsWith("- ")) continue;
    // Only an unindented bullet is a fact line: an indented one renders
    // nested under the bullet above it, as a note on that fact.
    const match = raw.startsWith("- ") ? FACT_LINE.exec(text) : null;
    if (!match) {
      unlabelled.push(text);
      continue;
    }
    const [, label, value] = match;
    const key = JSON.stringify([section, label]);
    const line = { section, label, value, text, claims: claims(value).claims };
    facts.set(key, [...(facts.get(key) ?? []), line]);
  }
  return { facts, unlabelled };
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

/** A line that records an absence; filling it in is a first write. */
const PLACEHOLDER = /not in the wiki/i;

/** A fact whose value records an absence: `- **Label**: not in the wiki`. */
const isPlaceholder = (fact: FactLine) =>
  /^not in the wiki\b/i.test(fact.value);

/** `- **Label**: value`, the shape of every Profile and Obligation fact line. */
const FACT_LINE = /^- (\*\*[^*]+\*\*):\s*(.+)$/;

/** `⚠ **Conflict**[, unresolved since <date>]: <claim> or <claim> ...` */
const CONFLICT_VALUE = /^(?:⚠\s*)?\*\*Conflict\*\*[^:]*:\s*(.+)$/;

/**
 * The claims a fact line's value states. A plain value is one claim; a
 * Conflict's claims are split after each Citation at " or ", so a claim is
 * its value with its Citations. Whitespace is normalised and a trailing full
 * stop dropped; nothing else is.
 */
function claims(value: string): { conflict: boolean; claims: string[] } {
  const norm = (claim: string) =>
    claim.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const conflict = CONFLICT_VALUE.exec(value.trim());
  if (!conflict) return { conflict: false, claims: [norm(value)] };
  return {
    conflict: true,
    claims: conflict[1].split(/(?<=\(src: [^)]+\))\s+or\s+/).map(norm),
  };
}

/**
 * A Contradiction may replace a fact line when the new line, under the same
 * label in the same section, is in the Schema's Conflict shape with at least
 * two claims and states the complete original claim (value and Citation,
 * whitespace aside) as one of them: both claims equally, none primary. If the
 * replaced line was already a Conflict, every one of its claims must survive.
 * Anything less changes the Established Fact and needs `change_fact`.
 */
function keeps(line: FactLine, fact: FactLine): boolean {
  const now = claims(line.value);
  return (
    now.conflict &&
    now.claims.length >= 2 &&
    fact.claims.every((claim) => now.claims.includes(claim))
  );
}
