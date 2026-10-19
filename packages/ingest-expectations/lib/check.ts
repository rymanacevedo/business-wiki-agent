import type { ManifestEntry } from "../../corpus";
import {
  allocations,
  cites,
  expenseFields,
  kindOf,
  pageField,
  paymentStatus,
  records,
  section,
  slug,
  words,
  type Wiki,
} from "./pages";

export type Check = { name: string; passed: boolean; detail?: string };

export type IngestResult = {
  /** Hard checks: the eval fails if any is false. */
  gates: Check[];
  /** Everything else, as the fraction found (1 when nothing is expected). */
  extraction: { score: number; checks: Check[] };
  /** The Source's summary Page path, or null when Clerk created none. */
  summary: string | null;
};

const AMBIGUOUS = new Set(["supplies", "equipment"]);
const URGENCY =
  /\b(overdue|past[- ]due|missed|lapsed|expired|due soon|urgent(ly)?)\b/i;
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
const check = (name: string, passed: boolean, detail?: string): Check =>
  detail === undefined || passed ? { name, passed } : { name, passed, detail };

/**
 * What one Ingest of `entry` should have left in the Wiki, derived from the
 * Manifest: `before` is the seeded Wiki, `after` the session's Wiki once the
 * turn settled. Trap kinds switch the expectations (eval design item 8).
 */
export function checkIngest(
  entry: ManifestEntry,
  { before, after }: { before: Wiki; after: Wiki }
): IngestResult {
  const summary = summaryOf(entry.id, after);
  const page = summary ? after.get(summary)! : null;
  const gates: Check[] = [
    check("page", summary !== null, `no summary Page cites ${entry.id}`),
  ];
  const found: Check[] = [];
  const expectsRecord = entry.amount !== null && entry.duplicateOf === null;

  if (expectsRecord) gates.push(...recordGates(entry, page, after));
  if (entry.duplicateOf !== null || entry.kind === "bank-statement")
    gates.push(noNewRecord(entry.id, page, before, after));
  if (entry.trap === "past-deadline") gates.push(pastDeadline(entry, after));

  if (expectsRecord && page) found.push(...recordFields(entry, page));
  else if (expectsRecord)
    found.push(
      ...["vendor", "date", "sum", "payment status"].map((n) => check(n, false))
    );
  for (const obligation of entry.obligations)
    found.push(obligationCheck(entry.id, obligation, after));
  for (const fact of entry.profile)
    found.push(profileCheck(entry.id, fact, { before, after }));
  found.push(...logChecks(entry, before, after));
  for (const record of [
    ...entry.corroborates,
    ...(entry.duplicateOf ? [entry.duplicateOf] : []),
  ])
    if (before.has(`summaries/${record}.md`))
      found.push(alsoSeenIn(entry.id, record, after));
  found.push(noUrgency(entry.id, before, after));

  const score = found.length
    ? found.filter((c) => c.passed).length / found.length
    : 1;
  return { gates, extraction: { score, checks: found }, summary };
}

function summaryOf(id: string, wiki: Wiki): string | null {
  const own = `summaries/${id}.md`;
  const page = wiki.get(own);
  if (page && kindOf(page) === "summary" && cites(page, id)) return own;
  for (const [path, body] of wiki)
    if (kindOf(body) === "summary" && cites(body, id)) return path;
  return null;
}

function recordGates(
  entry: ManifestEntry,
  page: string | null,
  after: Wiki
): Check[] {
  const fields = page ? expenseFields(page) : null;
  const allocated = page ? allocations(page) : [];
  const categories = [...new Set(allocated.map((a) => a.category))].sort();
  const expected = [
    ...new Set(entry.allocations.map((a) => a.category)),
  ].sort();
  const amount = Number(fields?.amount);
  const gates = [
    check(
      "amount",
      fields !== null && sameAmount(amount, entry.amount!),
      `expected ${entry.amount}, found ${fields?.amount ?? "no Record"}`
    ),
  ];
  const got = `found [${categories.join(", ")}]`;
  if (entry.trap === "ambiguous-category") {
    const flagged = /needs-owner/.test(pageField(page ?? "", "flags") ?? "");
    gates.push(
      check(
        "ambiguous-categories",
        categories.length > 0 &&
          categories.every((c) => AMBIGUOUS.has(c)) &&
          (allocated.length >= 2 || flagged),
        `expected supplies/equipment with two Allocations or needs-owner, ${got}`
      )
    );
  } else if (expected.length === 1 && expected[0] === "personal") {
    gates.push(
      check(
        "personal-only",
        allocated.length === 1 && categories[0] === "personal",
        `expected one personal Allocation, ${got}`
      )
    );
    const ledgers = [...after]
      .filter(
        ([path, body]) =>
          path.startsWith("expenses/") &&
          path !== "expenses/personal.md" &&
          body.includes(`summaries/${entry.id}.md`)
      )
      .map(([path]) => path);
    gates.push(
      check(
        "no-business-ledger",
        ledgers.length === 0,
        `listed in ${ledgers.join(", ")}`
      )
    );
  } else {
    gates.push(
      check(
        "categories",
        categories.join() === expected.join(),
        `expected [${expected.join(", ")}], ${got}`
      )
    );
  }
  return gates;
}

function recordFields(entry: ManifestEntry, page: string): Check[] {
  const fields = expenseFields(page) ?? {};
  const allocated = allocations(page);
  const total = allocated.reduce((sum, a) => sum + a.amount, 0);
  const status = paymentStatus(page);
  return [
    check(
      "vendor",
      slug(fields.vendor ?? "") === entry.vendor,
      `expected ${entry.vendor}, found ${fields.vendor}`
    ),
    check(
      "date",
      fields.date === entry.date,
      `expected ${entry.date}, found ${fields.date}`
    ),
    check(
      "sum",
      allocated.length > 0 && sameAmount(total, entry.amount!),
      `Allocations sum to ${total}, not ${entry.amount}`
    ),
    check(
      "payment status",
      status === entry.payment?.status,
      `expected ${entry.payment?.status}, found ${status}`
    ),
  ];
}

function noNewRecord(
  id: string,
  page: string | null,
  before: Wiki,
  after: Wiki
): Check {
  const added = records(after).filter(
    (path) => !before.has(path) && cites(after.get(path)!, id)
  );
  return check(
    "no-new-record",
    page !== null && expenseFields(page) === null && added.length === 0,
    `new Records: ${added.join(", ") || "the summary has an expense block"}`
  );
}

function pastDeadline(entry: ManifestEntry, after: Wiki): Check {
  const expiry = entry.obligations.find((o) => o.kind === "permit-expiry");
  const path = expiry && obligationPath(entry.id, expiry, after);
  const active = path
    ? pageField(after.get(path)!, "status") === "active"
    : false;
  return check(
    "past-deadline-obligation",
    Boolean(path && active && indexLine(after, path, expiry!)),
    `expected an active permit-expiry Obligation due ${expiry?.due} with its Index line`
  );
}

type Obligation = ManifestEntry["obligations"][number];

function obligationPath(
  id: string,
  obligation: Obligation,
  wiki: Wiki
): string | undefined {
  for (const [path, page] of wiki)
    if (
      path.startsWith("obligations/") &&
      cites(page, id) &&
      pageField(page, "obligation") === obligation.kind &&
      pageField(page, "due") === obligation.due
    )
      return path;
  return undefined;
}

function indexLine(wiki: Wiki, path: string, obligation: Obligation): boolean {
  const prefix = `- ${obligation.due} ${obligation.kind} (active)`;
  return (wiki.get("index.md") ?? "")
    .split("\n")
    .some((line) => line.startsWith(prefix) && line.includes(`](${path})`));
}

function obligationCheck(
  id: string,
  obligation: Obligation,
  wiki: Wiki
): Check {
  const path = obligationPath(id, obligation, wiki);
  return check(
    `obligation ${obligation.kind} ${obligation.due}`,
    Boolean(path && indexLine(wiki, path, obligation)),
    path
      ? `no Index line "- ${obligation.due} ${obligation.kind} (active)"`
      : "no such Obligation Page"
  );
}

/**
 * The fact is on the Profile citing this Source, or was already there citing
 * another one before this Ingest (Clerk does not cite a known fact twice).
 */
function profileCheck(
  id: string,
  fact: ManifestEntry["profile"][number],
  { before, after }: { before: Wiki; after: Wiki }
): Check {
  const value = words(fact.value);
  const states = (wiki: Wiki, citation: string) =>
    (wiki.get("profile.md") ?? "")
      .split("\n")
      .filter((line) => line.includes(citation))
      .some((line) => {
        const have = new Set(words(line));
        return value.every((w) => have.has(w));
      });
  return check(
    `profile ${fact.fact}`,
    states(after, `(src: ${id})`) || states(before, "(src: "),
    `no Profile line citing ${id} states "${fact.value}"`
  );
}

function logLines(wiki: Wiki): string[] {
  return (wiki.get("log.md") ?? "")
    .split("\n")
    .filter((l) => l.startsWith("- "));
}

function logChecks(entry: ManifestEntry, before: Wiki, after: Wiki): Check[] {
  return entry.log.map((expected) => {
    const [type, subject] = expected.split(" ");
    const count = (wiki: Wiki) =>
      logLines(wiki).filter((l) => l.includes(` ${type} ${subject}`)).length;
    const added = count(after) - count(before);
    return type === "INGEST"
      ? check("one INGEST line", added === 1, `${added} new ${expected} lines`)
      : check(`log ${expected}`, added >= 1, `no new ${expected} line`);
  });
}

function alsoSeenIn(id: string, record: string, after: Wiki): Check {
  const lines = section(
    after.get(`summaries/${record}.md`) ?? "",
    "Also seen in"
  );
  return check(
    `also-seen-in ${record}`,
    lines.some((line) => line.includes(id)),
    `summaries/${record}.md has no "## Also seen in" line for ${id}`
  );
}

function noUrgency(id: string, before: Wiki, after: Wiki): Check {
  const hits = [...after]
    .filter(
      ([path, page]) =>
        path !== "log.md" &&
        before.get(path) !== page &&
        (cites(page, id) || path === "index.md")
    )
    .filter(([, page]) => URGENCY.test(page))
    .map(([path, page]) => `${path}: "${URGENCY.exec(page)![0]}"`);
  return check("no urgency words", hits.length === 0, hits.join("; "));
}
