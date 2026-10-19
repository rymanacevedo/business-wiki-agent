import {
  expenseFields,
  pageField,
  pageSources,
  paymentStatus,
} from "../../page-edits";

export type Wiki = ReadonlyMap<string, string>;

export type Allocation = { category: string; amount: number };

/** The Record's `expense.allocations`, flow (`- { category, amount }`) or block YAML. */
export function allocations(page: string): Allocation[] {
  const lines = frontmatter(page);
  const start = lines.findIndex((line) => /^\s+allocations\s*:/.test(line));
  if (start === -1) return [];
  const depth = indent(lines[start]);
  const text: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && indent(line) <= depth && !line.trim().startsWith("-"))
      break;
    text.push(line);
  }
  const result: Allocation[] = [];
  for (const item of text
    .join("\n")
    .split(/^\s*-\s*/m)
    .slice(1)) {
    const category = /category:\s*["']?([a-z-]+)/.exec(item)?.[1];
    const amount = /amount:\s*["']?([0-9.]+)/.exec(item)?.[1];
    if (category && amount) result.push({ category, amount: Number(amount) });
  }
  return result;
}

function frontmatter(page: string): string[] {
  const lines = page.split("\n");
  if (lines[0]?.trim() !== "---") return [];
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  return lines.slice(1, end === -1 ? undefined : end);
}

const indent = (line: string) => line.length - line.trimStart().length;

export const kindOf = (page: string) => pageField(page, "kind");
export const cites = (page: string, id: string) =>
  pageSources(page).includes(id);
export const isRecord = (page: string) => expenseFields(page) !== null;
export { expenseFields, pageField, paymentStatus };

/** Paths of every Record (a summary with an `expense` block). */
export function records(wiki: Wiki): string[] {
  return [...wiki]
    .filter(([path, page]) => path.startsWith("summaries/") && isRecord(page))
    .map(([path]) => path);
}

/** The lines under a `## <heading>` body section, up to the next heading. */
export function section(page: string, heading: string): string[] {
  const lines = page.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line.trim())
  );
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
  return rest.slice(0, end === -1 ? undefined : end);
}

/** Lowercase alphanumeric words, for loose value matching. */
export const words = (text: string) =>
  text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export const slug = (text: string) => words(text).join("-");
