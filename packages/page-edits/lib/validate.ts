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
  const keys = topLevelKeys(frontmatter);
  for (const key of REQUIRED)
    if (!keys.has(key)) fail(path, `frontmatter has no ${key}`);
  const kind = keys.get("kind");
  const expected = FOLDER_KINDS.find(([pattern]) => pattern.test(path))?.[1];
  if (expected && kind !== expected)
    fail(path, `kind is ${kind}, but Pages here are kind: ${expected}`);
  if (body.some((line) => /^(expense|payment|allocations):/.test(line)))
    fail(path, "the expense block belongs in the frontmatter, not the body");
  if (kind === "obligation") {
    if (!OBLIGATION_KINDS.includes(keys.get("obligation") ?? ""))
      fail(
        path,
        `obligation kind must be one of ${OBLIGATION_KINDS.join(", ")}`
      );
    if (!DATE.test(keys.get("due") ?? ""))
      fail(path, "an Obligation needs due: YYYY-MM-DD");
  }
  const expense = nested(frontmatter, "expense");
  if (expense.length) checkExpense(path, expense);
}
