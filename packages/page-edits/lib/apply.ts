/** An edit that cannot be applied as written. */
export class PageEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageEditError";
  }
}

export type Edit = {
  /** Exact text currently on the Page; empty appends `replace` at the end. */
  find: string;
  replace: string;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

function count(haystack: string, needle: string): number {
  let n = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + 1)
  )
    n++;
  return n;
}

/**
 * Line-wise match ignoring indentation. Returns the replaced Page, with the
 * replacement re-indented by the Page's offset, or null when it does not match
 * exactly once.
 */
function applyLoose(page: string, { find, replace }: Edit): string | null {
  const lines = page.split("\n");
  const wanted = find.split("\n").map((line) => line.trim());
  while (wanted.length && wanted[wanted.length - 1] === "") wanted.pop();
  if (wanted.length === 0) return null;
  const starts: number[] = [];
  for (let i = 0; i + wanted.length <= lines.length; i++)
    if (wanted.every((line, j) => lines[i + j].trim() === line)) starts.push(i);
  if (starts.length !== 1) return null;
  const [start] = starts;
  const offset = indentOf(lines[start]) - indentOf(find.split("\n")[0]);
  const replacement = replace
    .replace(/\n$/, "")
    .split("\n")
    .map((line) =>
      offset >= 0
        ? (line.trim() ? " ".repeat(offset) : "") + line
        : line.slice(Math.min(-offset, indentOf(line)))
    );
  lines.splice(start, wanted.length, ...replacement);
  return lines.join("\n");
}

/** Apply edits in order; each `find` must match exactly once. */
export function applyEdits(page: string, edits: Edit[]): string {
  let result = page;
  for (const edit of edits) {
    if (edit.find === "") {
      result += edit.replace;
      continue;
    }
    const exact = count(result, edit.find);
    if (exact === 1) {
      result = result.replace(edit.find, () => edit.replace);
      continue;
    }
    if (exact > 1)
      throw new PageEditError(
        `find text matches ${exact} times; include more surrounding text so it matches once: ${JSON.stringify(edit.find)}`
      );
    const loose = applyLoose(result, edit);
    if (loose === null)
      throw new PageEditError(
        `find text not found on the Page (read_page and copy it exactly): ${JSON.stringify(edit.find)}`
      );
    result = loose;
  }
  return result;
}
