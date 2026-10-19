import {
  expenseFields,
  pageField,
  pageSources,
  paymentStatus,
} from "../../packages/page-edits";
import type { WikiStore } from "../../packages/wiki-store";
import { declinedOn, NOTHING_DECLINED, type Declined } from "./declined";
import { LOG, SCHEMA } from "./pages";

const INDEX = "index.md";
const SUMMARY_LINK = /summaries\/([a-z0-9][a-z0-9-]*)\.md/g;
const EXPENSE = /^expense\s*:/m;
const NO_BUSINESS_FACTS = /^- \*\*Business facts\*\*: none new/m;

/** Every Page but the Index, Log, Schema, and Sources, by path. */
async function readPages(store: WikiStore): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  for (const path of await store.list("")) {
    if (path.startsWith("sources/") || [INDEX, LOG, SCHEMA].includes(path))
      continue;
    const page = await store.read(path);
    if (page) pages.set(path, page.body);
  }
  return pages;
}

/**
 * What still stands between Source `id` and its one INGEST line: every Page
 * citing the Source in its `sources` has an Index line, and every
 * Obligation's line starts with its current `<due> <kind> (<status>)`; an
 * invoice Record not shown paid, with a due date, has a payment Obligation
 * (citing the Source or linking the Record). A summary without an \`expense\`
 * block that links a Record (a duplicate, or a statement corroborating a
 * receipt) is listed under that Record's \`## Also seen in\`, and no Ledger
 * row counts it.
 *
 * What the Owner declined this turn is not asked for: the new Obligation of a
 * declined Supersession, and the Profile line a declined change would have
 * rewritten.
 *
 * A Record that lists the Source as payment evidence while it is not paid
 * needs a `change_fact` proposing its payment this turn (`proposed`, the
 * Pages this turn's proposals named): a proposal written only as prose parks
 * on nothing.
 */
export async function ingestProblems(
  store: WikiStore,
  id: string,
  declined: Declined = NOTHING_DECLINED,
  proposed: string[] = []
): Promise<string[]> {
  const indexLines = ((await store.read(INDEX))?.body ?? "").split("\n");
  const pages = await readPages(store);
  const flagLines = ((await store.read(LOG))?.body ?? "")
    .split("\n")
    .filter((line) => / FLAG \[/.test(line));
  const problems: string[] = [];
  for (const [path, body] of pages) {
    const cites = pageSources(body).includes(id);
    // Every flag on a Page this Source touched is logged, naming the Page.
    if (cites)
      for (const flag of pageField(body, "flags")?.match(/[a-z-]+/g) ?? [])
        if (!flagLines.some((l) => l.includes(`[${flag}]`) && l.includes(path)))
          problems.push(
            `${path} is flagged ${flag}: append_log a FLAG [${flag}] line whose detail names ${path}.`
          );
    const obligation = path.startsWith("obligations/");
    if (!cites && !obligation) continue;
    const line = indexLines.find((l) => l.includes(`](${path})`));
    if (!line) {
      if (cites)
        problems.push(
          `${path} has no Index line: add one to its section of index.md.`
        );
      continue;
    }
    // An Obligation's line leads with its current due date, kind, and status,
    // so a Supersession or a payment that closed it shows on the Index.
    const shape = `- ${pageField(body, "due")} ${pageField(body, "obligation")} (${pageField(body, "status")}): `;
    if (obligation && !line.startsWith(shape))
      problems.push(
        `The Index line for ${path} must start "${shape}[title](${path})".`
      );
  }
  for (const [path, body] of pages) {
    if (!path.startsWith("summaries/") || !EXPENSE.test(body)) continue;
    const seen = body.split(/^## Also seen in[^\n]*$/m)[1]?.split(/^## /m)[0];
    const evidence = seen
      ?.split("\n")
      .some((line) => line.includes(id) && /payment evidence/i.test(line));
    if (evidence && paymentStatus(body) !== "paid" && !proposed.includes(path))
      problems.push(
        `${path} lists ${id} as payment evidence but its payment is ${paymentStatus(body)} and no change_fact proposed it this turn: call change_fact now (the Record's payment block, and its payment Obligation's status), which waits for the Owner's Approval. A proposal written only in your reply is not one.`
      );
  }
  const summaryPath = `summaries/${id}.md`;
  const summary = pages.get(summaryPath);
  if (summary && EXPENSE.test(summary)) {
    // An invoice not shown paid, with a due date, owes a payment Obligation.
    const due = /^\s+due:\s*(\d{4}-\d{2}-\d{2})/m.exec(summary)?.[1];
    const owed = paymentStatus(summary) !== "paid" && due;
    const tracked = [...pages].some(
      ([path, body]) =>
        path.startsWith("obligations/") &&
        (pageSources(body).includes(id) || body.includes(summaryPath))
    );
    if (owed && !tracked) {
      const { vendor = "<vendor>", document = "<number>" } =
        expenseFields(summary) ?? {};
      problems.push(
        `${summaryPath} is an invoice with payment ${paymentStatus(summary)} due ${due}: create its payment Obligation obligations/${due}-pay-invoice-${vendor}-${document}.md (kind other, due ${due}, body linking the Record) and its Index line.`
      );
    }
  }
  const obligations = [...pages].filter(([path]) =>
    path.startsWith("obligations/")
  );
  const dueOn = (date: string) =>
    obligations.some(([, body]) =>
      new RegExp(`^due:\\s*${date}\\s*$`, "m").test(body)
    );
  // An expiry the Source states (a policy, permit, license, or registration)
  // is tracked by an Obligation due that day. A deadline counted from it (a
  // lease's notice date, "90 days before 2027-03-31") tracks it too, so a
  // lease end gets no second Obligation.
  const countedFrom = (date: string) =>
    obligations.some(
      ([, body]) => pageSources(body).includes(id) && body.includes(date)
    );
  for (const due of summary ? expiries(summary) : [])
    if (
      !dueOn(due) &&
      !countedFrom(due) &&
      !declined.obligations.some((o) => o.due === due)
    )
      problems.push(
        `${summaryPath} says something expires ${due}: create its Obligation (kind insurance-renewal, permit-expiry, or license-renewal, due ${due}, citing the Source) and its Index line.`
      );
  // A filing the Source says is due on a date (a tax return, a report) is an
  // Obligation due that day.
  for (const due of summary ? filings(summary) : [])
    if (!dueOn(due))
      problems.push(
        `${summaryPath} says a filing is due ${due}: create its Obligation (kind tax-filing, or annual-report for a report, due ${due}, citing the Source) and its Index line.`
      );
  if (!summary || EXPENSE.test(summary)) return problems;
  // A Source with no Record is a document about the Business (a lease, a
  // certificate, a filing): its new facts go on the Profile, or its summary
  // says it has none the Profile lacks.
  const profile = pages.get("profile.md");
  if (
    profile !== undefined &&
    !pageSources(profile).includes(id) &&
    !profile.includes(`(src: ${id})`) &&
    !NO_BUSINESS_FACTS.test(summary) &&
    declinedOn(declined, "profile.md").length === 0
  )
    problems.push(
      `profile.md cites nothing from ${id}: add the Source's new facts about the Business itself (legal name, entity type, addresses with suite, EIN, licenses and permits, insurance policy, lease terms and landlord, bank accounts, tax filings) to the Profile, each cited (src: ${id}), and ${id} to its sources. If the Source states none the Profile lacks, add the line "- **Business facts**: none new" to ${summaryPath}.`
    );
  for (const [, other] of summary.matchAll(SUMMARY_LINK)) {
    const recordPath = `summaries/${other}.md`;
    const record = pages.get(recordPath);
    if (other === id || !record || !EXPENSE.test(record)) continue;
    const seen = record.split(/^## Also seen in[^\n]*$/m)[1]?.split(/^## /m)[0];
    if (!seen?.includes(id))
      problems.push(
        `${summaryPath} links the Record ${recordPath}: list ${id} under that Record's "## Also seen in" with note_also_seen_in.`
      );
  }
  for (const [path, body] of pages)
    if (path.startsWith("expenses/") && body.includes(summaryPath))
      problems.push(
        `${path} has a row for ${summaryPath}, which carries no Record: a duplicate adds no Ledger row. Remove that row.`
      );
  return problems;
}

/** A summary's fact lines without their Citations: a Source id carries a date. */
function factLines(summary: string): string[] {
  return summary
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/\(src: [^)]*\)/g, ""));
}

/** Dates a summary's fact lines give as an expiry or a "valid through". */
function expiries(summary: string): string[] {
  const dates = new Set<string>();
  for (const line of factLines(summary)) {
    for (const [, date] of line.matchAll(
      /(?:expir[a-z]*|valid (?:through|until))\b[^;\n]*?(\d{4}-\d{2}-\d{2})/gi
    ))
      dates.add(date);
  }
  return [...dates];
}

/** Dates a summary's fact lines give for a return, filing, or report due. */
function filings(summary: string): string[] {
  const dates = new Set<string>();
  for (const line of factLines(summary)) {
    for (const [, date] of line.matchAll(
      /\b(?:returns?|filings?|reports?)\b[^;\n]*?\bdue\b[^;\n]*?(\d{4}-\d{2}-\d{2})/gi
    ))
      dates.add(date);
  }
  return [...dates];
}
