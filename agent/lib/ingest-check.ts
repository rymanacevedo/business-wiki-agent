import { pageField, pageSources } from "../../packages/page-edits";
import type { WikiStore } from "../../packages/wiki-store";
import { LOG, SCHEMA } from "./pages";

const INDEX = "index.md";
const SUMMARY_LINK = /summaries\/([a-z0-9][a-z0-9-]*)\.md/g;
const EXPENSE = /^expense\s*:/m;

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
 * Obligation's line starts with its current `<due> <kind> (<status>)`. A summary without an \`expense\`
 * block that links a Record (a duplicate, or a statement corroborating a
 * receipt) is listed under that Record's \`## Also seen in\`, and no Ledger
 * row counts it.
 */
export async function ingestProblems(
  store: WikiStore,
  id: string
): Promise<string[]> {
  const indexLines = ((await store.read(INDEX))?.body ?? "").split("\n");
  const pages = await readPages(store);
  const problems: string[] = [];
  for (const [path, body] of pages) {
    const cites = pageSources(body).includes(id);
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
  const summaryPath = `summaries/${id}.md`;
  const summary = pages.get(summaryPath);
  if (!summary || EXPENSE.test(summary)) return problems;
  for (const [, other] of summary.matchAll(SUMMARY_LINK)) {
    const recordPath = `summaries/${other}.md`;
    const record = pages.get(recordPath);
    if (other === id || !record || !EXPENSE.test(record)) continue;
    const seen = record.split(/^## Also seen in[^\n]*$/m)[1]?.split(/^## /m)[0];
    if (!seen?.includes(id))
      problems.push(
        `${summaryPath} links the Record ${recordPath}: list ${id} under that Record's "## Also seen in" section (add the section at the end if it has none).`
      );
  }
  for (const [path, body] of pages)
    if (path.startsWith("expenses/") && body.includes(summaryPath))
      problems.push(
        `${path} has a row for ${summaryPath}, which carries no Record: a duplicate adds no Ledger row. Remove that row.`
      );
  return problems;
}
