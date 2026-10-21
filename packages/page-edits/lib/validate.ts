import { PageEditError } from "./apply";
import {
  expenseStyleProblem,
  parseFrontmatter,
  splitPage,
  topLevelKeys,
} from "./frontmatter";
import { pageSources } from "./fields";
import { validateFactText } from "./plain";

const REQUIRED = [
  "title",
  "kind",
  "sources",
  "created",
  "updated",
  "status",
  "flags",
];

const OBLIGATION_KINDS = [
  "license-renewal",
  "permit-expiry",
  "insurance-renewal",
  "tax-filing",
  "annual-report",
  "lease-notice",
  "contract-renewal",
  "other",
];

const FOLDER_KINDS: [RegExp, string][] = [
  [/^summaries\//, "summary"],
  [/^entities\//, "entity"],
  [/^obligations\//, "obligation"],
  [/^expenses\//, "ledger"],
  [/^profile\.md$/, "profile"],
  [/^index\.md$/, "index"],
  [/^log\.md$/, "log"],
  [/^SCHEMA\.md$/, "schema"],
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A frontmatter field at the start of a body line: the YAML went in the wrong place. */
const FIELD =
  /^(title|kind|sources|created|updated|status|flags|expense|payment|allocations|entity|obligation|due|counterparty|recurs|superseded_by|done_on|category):/;

/** The Schema's closed list of expense categories. */
const CATEGORIES = [
  "supplies",
  "equipment",
  "rent",
  "utilities",
  "insurance",
  "professional-services",
  "vehicle",
  "meals",
  "software",
  "other",
  "personal",
];

function checkCategory(path: string, category: string | undefined): void {
  if (category !== undefined && !CATEGORIES.includes(category))
    fail(
      path,
      `category "${category}" is not in the closed list (${CATEGORIES.join(", ")})`
    );
}

/** Sections of a Profile or Obligation Page that hold no Source facts. */
const NON_FACT_SECTION = /^##\s+(History|Related|How this)/i;
/** Lines that mirror the frontmatter rather than state a Source fact. */
const MIRROR_LABEL = /^- \*\*(Status|Kind)\*\*:/;
/** A fact derived from another Page: the value is only a link to it. */
const PAGE_LINK_ONLY = /^- \*\*[^*]+\*\*:\s*\[[^\]]+\]\([^)]+\.md\)\s*\.?$/;

/** Top-level fact lines on a Profile or Obligation body that cite no Source. */
function uncitedFacts(body: string[]): string[] {
  const lines: string[] = [];
  let inFacts = true;
  for (const line of body) {
    if (line.startsWith("## ")) inFacts = !NON_FACT_SECTION.test(line);
    if (!inFacts || !line.startsWith("- ") || line.includes("(src: ")) continue;
    if (MIRROR_LABEL.test(line) || PAGE_LINK_ONLY.test(line)) continue;
    if (/not in the wiki/i.test(line)) continue;
    lines.push(line);
  }
  return lines;
}

/** Relative urgency is computed at Query or Lint time, never stored. */
const URGENCY = [/\bmissed\b/i, /\bdue soon\b/i, /\bdays out\b/i];

const INDEX_SECTIONS = [
  "Profile",
  "Obligations",
  "Entities",
  "Expense ledgers",
  "Sources",
];

/** The Index is one line per Page in five sections, each once, in order. */
function indexProblem(body: string[]): string | undefined {
  const headings = body
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());
  const twice = headings.find((h, i) => headings.indexOf(h) !== i);
  if (twice)
    return `the Index has the section "${twice}" more than once; add lines under the existing heading`;
  const known = headings.filter((h) => INDEX_SECTIONS.includes(h));
  if (known.join() !== INDEX_SECTIONS.filter((h) => known.includes(h)).join())
    return `Index sections must be in the order ${INDEX_SECTIONS.join(", ")}; found ${known.join(", ")}`;
  const counts = new Map<string, number>();
  let section = "";
  for (const line of body) {
    if (line.startsWith("## ")) section = line.slice(3).trim();
    if (!line.startsWith("- ")) continue;
    const target = /\]\(([^)\s]+\.md)\)/.exec(line)?.[1];
    if (!target) continue;
    if (section === "Sources" && !/^- \d{4}-\d{2}-\d{2} /.test(line))
      return `the Index line for ${target} must start with its date and kind: "- <YYYY-MM-DD> <kind>: [title](${target}): summary"`;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  for (const [target, count] of counts)
    if (count > 1)
      return `the Index lists ${target} ${count} times; one line per Page, edit the existing line in place`;
  return undefined;
}

const fail = (path: string, problem: string): never => {
  throw new PageEditError(
    `${path} is not a valid Page: ${problem} (see SCHEMA.md, Frontmatter).`
  );
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The lines nested under a top-level key, e.g. `expense:`. */
function nested(frontmatter: string[], key: string): string[] {
  const start = frontmatter.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return [];
  const lines: string[] = [];
  for (const line of frontmatter.slice(start + 1)) {
    if (line.trim() && indentOf(line) === 0) break;
    lines.push(line);
  }
  return lines;
}

const cents = (value: string) => Math.round(Number(value) * 100);

function checkExpense(path: string, expense: string[]) {
  const child = Math.min(...expense.filter((l) => l.trim()).map(indentOf));
  const field = (name: string) =>
    expense.find(
      (l) => indentOf(l) === child && l.trim().startsWith(`${name}:`)
    );
  const amount = /amount:\s*([\d.]+)/.exec(field("amount") ?? "")?.[1];
  if (!amount) fail(path, "expense.amount is missing");
  const allocationsAt = expense.findIndex(
    (l) => indentOf(l) === child && l.trim().startsWith("allocations:")
  );
  if (allocationsAt === -1) fail(path, "expense.allocations is missing");
  const allocations: number[] = [];
  for (const line of expense.slice(allocationsAt + 1)) {
    if (line.trim() && indentOf(line) <= child) break;
    for (const match of line.matchAll(/amount:\s*([\d.]+)/g))
      allocations.push(cents(match[1]));
    for (const match of line.matchAll(/category:\s*([\w-]+)/g))
      checkCategory(path, match[1]);
  }
  const sum = allocations.reduce((a, b) => a + b, 0);
  if (allocations.length === 0 || sum !== cents(amount!))
    fail(
      path,
      `Allocations sum to ${(sum / 100).toFixed(2)}, not the amount ${amount}`
    );
  const status = expense.find(
    (l) => /^\s+status:/.test(l) && indentOf(l) > child
  );
  if (!status || !/status:\s*(paid|unpaid|unknown)\s*$/.test(status))
    fail(path, "expense.payment.status must be paid, unpaid, or unknown");
}

const ALSO_SEEN_IN = /^##\s+Also seen in\b/i;

/**
 * `## Also seen in` exists only to list Sources: one section per Page, never
 * empty (a Record nothing else mentions has no such section).
 */
function alsoSeenInProblem(body: string[]): string | undefined {
  const starts = body.flatMap((line, i) =>
    ALSO_SEEN_IN.test(line) ? [i] : []
  );
  if (starts.length > 1)
    return `"## Also seen in" appears ${starts.length} times; keep one section and add every line under it`;
  if (starts.length === 0) return undefined;
  const rest = body.slice(starts[0] + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const items = (end === -1 ? rest : rest.slice(0, end)).filter((line) =>
    line.startsWith("- ")
  );
  if (items.length === 0)
    return `"## Also seen in" lists no Source; add the section only with its first "- <source-id> ..." line`;
  return undefined;
}

/** "90 days before ... 2027-03-31" or "2027-03-31 minus 90 days". */
const DAYS_BEFORE =
  /(\d+)\s+(?:calendar\s+)?days?\s+before\b[^\n]*?(\d{4}-\d{2}-\d{2})/i;
const DATE_MINUS =
  /(\d{4}-\d{2}-\d{2})\s+minus\s+(\d+)\s+(?:calendar\s+)?days?/i;

function daysBefore(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - days);
  return day.toISOString().slice(0, 10);
}

/**
 * A lease notice is due a stated number of calendar days before the term
 * ends; the Page says how it was computed, and its due date is that day.
 */
function checkCountedDue(path: string, due: string, body: string[]): void {
  // Citations carry Source dates, never the date counted from.
  const lines = body.map((line) => line.replace(/\(src: [^)]*\)/g, ""));
  let rule: { days: number; from: string } | undefined;
  for (const line of lines) {
    const minus = DATE_MINUS.exec(line);
    if (minus) rule ??= { days: Number(minus[2]), from: minus[1] };
  }
  for (const line of lines) {
    const before = DAYS_BEFORE.exec(line);
    if (before) rule ??= { days: Number(before[1]), from: before[2] };
  }
  if (!rule)
    fail(
      path,
      `a lease-notice Obligation says how its due date was computed, e.g. "90 days before the term ends on <YYYY-MM-DD>"`
    );
  const expected = daysBefore(rule!.from, rule!.days);
  if (expected !== due)
    fail(
      path,
      `${rule!.days} calendar days before ${rule!.from} is ${expected}, not ${due}: set due (and the file name and title) to ${expected}`
    );
}

/** Throws PageEditError when `page` breaks the Schema's frontmatter rules for `path`. */
export function validatePage(path: string, page: string): void {
  if (!page.startsWith("---\n"))
    fail(path, "it must start with YAML frontmatter");
  const { frontmatter, body } = splitPage(page);
  // Unindented frontmatter lines are `key: value`; anything else is body
  // text that landed above the closing `---`.
  const misplaced = frontmatter.find(
    (line) => line.trim() && !/^\s/.test(line) && !/^[A-Za-z_]+\s*:/.test(line)
  );
  if (misplaced)
    fail(
      path,
      `body text belongs below the closing ---, not in the frontmatter (found "${misplaced.trim()}")`
    );
  const doc = parseFrontmatter(frontmatter);
  if (!doc)
    fail(
      path,
      "the frontmatter is not valid YAML (quote a value that contains a colon, close every [ ] and { })"
    );
  const style = expenseStyleProblem(doc!);
  if (style) fail(path, style);
  const keys = topLevelKeys(frontmatter);
  for (const key of REQUIRED)
    if (!keys.has(key)) fail(path, `frontmatter has no ${key}`);
  const kind = keys.get("kind");
  const expected = FOLDER_KINDS.find(([pattern]) => pattern.test(path))?.[1];
  if (expected && kind !== expected)
    fail(path, `kind is ${kind}, but Pages here are kind: ${expected}`);
  const stray = body.find((line) => FIELD.test(line));
  if (stray)
    fail(
      path,
      `frontmatter fields belong in the frontmatter, not the body (found "${stray.trim()}")`
    );
  if (kind === "ledger") checkCategory(path, keys.get("category"));
  if (kind === "obligation") {
    if (!OBLIGATION_KINDS.includes(keys.get("obligation") ?? ""))
      fail(
        path,
        `obligation kind must be one of ${OBLIGATION_KINDS.join(", ")}`
      );
    if (!DATE.test(keys.get("due") ?? ""))
      fail(path, "an Obligation needs due: YYYY-MM-DD");
    // A Source's own date is in its id. What happened on or before the day
    // the document was written (a filing made, a registration issued) is a
    // fact for the Profile, not an Obligation.
    const stated = pageSources(page)
      .map((id) => /^\d{4}-\d{2}-\d{2}/.exec(id)?.[0])
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    if (stated && keys.get("due")! <= stated)
      fail(
        path,
        `an Obligation is due after the document that states it (${stated}), not on ${keys.get("due")}: a past event is a Profile or summary fact, not an Obligation`
      );
    if (keys.get("obligation") === "lease-notice")
      checkCountedDue(path, keys.get("due")!, body);
  }
  validateFactText(path, page);
  if (kind === "profile" || kind === "obligation") {
    const uncited = uncitedFacts(body)[0];
    if (uncited)
      fail(
        path,
        `every fact line on a Profile or Obligation ends with a Citation "(src: <source-id>)" (found "${uncited.trim()}")`
      );
  }
  if (kind !== "log" && kind !== "schema")
    for (const pattern of URGENCY) {
      const hit = body.find((line) => pattern.test(line));
      if (hit)
        fail(
          path,
          `relative urgency is computed when asked, never stored: drop "${pattern.exec(hit)![0].toLowerCase()}" (found "${hit.trim()}")`
        );
    }
  const seen = alsoSeenInProblem(body);
  if (seen) fail(path, seen);
  if (kind === "index") {
    const problem = indexProblem(body);
    if (problem) fail(path, problem);
  }
  const expense = nested(frontmatter, "expense");
  if (expense.length) checkExpense(path, expense);
}
