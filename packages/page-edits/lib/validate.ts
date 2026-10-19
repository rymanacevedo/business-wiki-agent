import { PageEditError } from "./apply";
import { splitPage, topLevelKeys } from "./frontmatter";

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
  if (kind === "obligation") {
    if (!OBLIGATION_KINDS.includes(keys.get("obligation") ?? ""))
      fail(
        path,
        `obligation kind must be one of ${OBLIGATION_KINDS.join(", ")}`
      );
    if (!DATE.test(keys.get("due") ?? ""))
      fail(path, "an Obligation needs due: YYYY-MM-DD");
  }
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
  if (kind === "index") {
    const problem = indexProblem(body);
    if (problem) fail(path, problem);
  }
  const expense = nested(frontmatter, "expense");
  if (expense.length) checkExpense(path, expense);
}
