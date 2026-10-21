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
  constructor(path: string, what: string, fact?: Fact) {
    const shape = fact
      ? `\`- ${fact.label}: ⚠ **Conflict**, unresolved since <Demo Date>: ${fact.claims.join(" or ")} or <new value> (src: <new source>)\``
      : "`- **Label**: ⚠ **Conflict**, unresolved since <Demo Date>: <current value> (src: <its source>) or <new value> (src: <new source>)`";
    super(
      `update_page cannot change ${what} on ${path}: it is an Established Fact. ` +
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
    const fact = FACT_LINE.exec(line);
    throw new EstablishedFactError(
      path,
      `the fact line "${line}"`,
      fact ? { label: fact[1], claims: claims(fact[2]).claims } : undefined
    );
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
 * A Contradiction may replace a fact line when the new line keeps the same
 * label, is in the Schema's Conflict shape with at least two claims, and
 * states the complete original claim (value and Citation, whitespace aside)
 * as one of them: both claims equally, none primary. If the replaced line was
 * already a Conflict, every one of its claims must survive. Anything less
 * changes the Established Fact and needs `change_fact`.
 */
function keptInConflict(line: string, body: string[]): boolean {
  const match = FACT_LINE.exec(line);
  if (!match) return false;
  const [, label, value] = match;
  const original = claims(value).claims;
  return body.some((next) => {
    const found = FACT_LINE.exec(next.trim());
    if (!found || found[1] !== label) return false;
    const now = claims(found[2]);
    return (
      now.conflict &&
      now.claims.length >= 2 &&
      original.every((claim) => now.claims.includes(claim))
    );
  });
}
