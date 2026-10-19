import { pageField, validatePage } from "../../packages/page-edits";
import { WikiConflictError, type WikiStore } from "../../packages/wiki-store";
import { INDEX, tidyIndex, touch } from "./pages";

/** The Index section a Page's line belongs in, by its folder. */
const SECTIONS: [RegExp, string][] = [
  [/^profile\.md$/, "Profile"],
  [/^obligations\//, "Obligations"],
  [/^entities\//, "Entities"],
  [/^expenses\//, "Expense ledgers"],
  [/^summaries\//, "Sources"],
];

/** The start every Obligation's Index line has: `- <due> <kind> (<status>): `. */
export function obligationPrefix(page: string): string {
  return `- ${pageField(page, "due")} ${pageField(page, "obligation")} (${pageField(page, "status")}): `;
}

/**
 * Problems with `line` as the Index line of the new Page `path`: it is one
 * list line that links the Page, and an Obligation's leads with its due date,
 * kind, and status.
 */
export function indexLineProblem(
  path: string,
  page: string,
  line: string
): string | undefined {
  if (!line.startsWith("- ") || line.includes("\n"))
    return `index_line is one line starting "- ".`;
  if (!line.includes(`](${path})`))
    return `index_line must link the Page as [title](${path}).`;
  if (
    path.startsWith("obligations/") &&
    !line.startsWith(obligationPrefix(page))
  )
    return `index_line for an Obligation starts "${obligationPrefix(page)}[title](${path})".`;
  return undefined;
}

/** The Index with `line` added under the section for `path` (if not there). */
export function withIndexLine(
  index: string,
  path: string,
  line: string
): string {
  if (index.includes(`](${path})`)) return index;
  const section = SECTIONS.find(([pattern]) => pattern.test(path))?.[1];
  if (!section) throw new Error(`No Index section holds ${path}.`);
  const heading = new RegExp(`^## ${section}[ \\t]*$`, "m");
  const at = heading.exec(index);
  const next = at
    ? `${index.slice(0, at.index + at[0].length)}\n${line}${index.slice(at.index + at[0].length)}`
    : `${index.replace(/\s+$/, "")}\n\n## ${section}\n\n${line}\n`;
  return tidyIndex(next);
}

/**
 * Rewrite the Index, re-reading on a conflict (the model may create several
 * Pages in parallel in one step). `edit` returns the new Index body.
 */
export async function editIndex(
  store: WikiStore,
  edit: (index: string) => string
): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const index = await store.read(INDEX);
    if (!index) return false;
    const next = edit(index.body);
    if (next === index.body) return false;
    const stamped = touch(next);
    validatePage(INDEX, stamped);
    try {
      await store.write(INDEX, stamped, { etag: index.etag });
      return true;
    } catch (error) {
      if (!(error instanceof WikiConflictError) || attempt >= 4) throw error;
    }
  }
}

/** The Index with each Obligation's line led by its current due, kind, and status. */
export function withObligationLines(
  index: string,
  obligations: ReadonlyMap<string, string>
): string {
  return index
    .split("\n")
    .map((line) => {
      for (const [path, page] of obligations)
        if (line.includes(`](${path})`))
          return line.replace(
            /^- (?:\d{4}-\d{2}-\d{2} [a-z-]+ \([a-z]+\): )?/,
            obligationPrefix(page)
          );
      return line;
    })
    .join("\n");
}
