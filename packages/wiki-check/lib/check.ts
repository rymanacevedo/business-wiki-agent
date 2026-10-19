import { pageField, validatePage } from "../../page-edits";

const INDEX = "index.md";
const LOG = "log.md";
const SCHEMA = "SCHEMA.md";

/** Pages that are the Wiki's own scaffolding: never listed in the Index. */
const UNLISTED = [INDEX, LOG, SCHEMA];

function frontmatterOnly(page: string): string {
  const end = page.indexOf("\n---\n", 4);
  return end === -1 ? page : page.slice(0, end + 5);
}

/**
 * Every way a Wiki (a fixture, or a namespace after an eval turn) breaks the
 * Schema's standing rules. `pages` maps a Page path, relative to the Wiki
 * root, to its text; Sources are ignored. An empty list means consistent.
 */
export function checkWiki(pages: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  const wiki = [...pages].filter(([path]) => !path.startsWith("sources/"));

  for (const [path, page] of wiki) {
    try {
      // Per-Page rules (frontmatter, Citations, stored urgency, Index shape)
      // live in validatePage, which the write tools also enforce. The
      // Schema's body quotes frontmatter examples; check its own only.
      validatePage(path, path === SCHEMA ? frontmatterOnly(page) : page);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }

  const index = pages.get(INDEX);
  if (!index) problems.push("The Wiki has no index.md.");
  else {
    const linked = new Set(
      [...index.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => m[1])
    );
    for (const [path] of wiki)
      if (!UNLISTED.includes(path) && !linked.has(path))
        problems.push(`${path} is not listed in the Index.`);
    for (const target of linked)
      if (!pages.has(target))
        problems.push(`The Index links ${target}, which is not a Page.`);
  }

  const log = pages.get(LOG);
  if (!log) problems.push("The Wiki has no log.md.");
  else {
    const ingested = new Set(
      [...log.matchAll(/^- \d{4}-\d{2}-\d{2} INGEST \[([^\]]+)\]/gm)].map(
        (m) => m[1]
      )
    );
    const summaries = wiki
      .map(([path]) => /^summaries\/(.+)\.md$/.exec(path)?.[1])
      .filter((id): id is string => Boolean(id));
    for (const id of summaries)
      if (!ingested.has(id))
        problems.push(`summaries/${id}.md has no INGEST line in the Log.`);
    for (const id of ingested)
      if (!summaries.includes(id))
        problems.push(`The Log has INGEST [${id}] but no summary Page for it.`);
    const flagLines = log.split("\n").filter((line) => / FLAG \[/.test(line));
    for (const [path, page] of wiki)
      for (const flag of pageField(page, "flags")?.match(/[a-z-]+/g) ?? [])
        if (!flagLines.some((l) => l.includes(`[${flag}]`) && l.includes(path)))
          problems.push(
            `${path} is flagged ${flag} but no FLAG [${flag}] line names it in the Log.`
          );
  }
  return problems;
}
