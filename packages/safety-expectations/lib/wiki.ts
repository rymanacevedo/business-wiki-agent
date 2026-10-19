import {
  expenseFields,
  pageField,
  pageSources,
  paymentStatus,
} from "../../page-edits";

/** A Wiki as `path -> Page`, Sources excluded (see `readWikiDir`). */
export type Wiki = ReadonlyMap<string, string>;

export type Check = { name: string; passed: boolean; detail?: string };

export const check = (name: string, passed: boolean, detail?: string): Check =>
  detail === undefined || passed ? { name, passed } : { name, passed, detail };

export const cites = (page: string, id: string) =>
  pageSources(page).includes(id);

export const flagsOf = (page: string) =>
  (pageField(page, "flags") ?? "")
    .replace(/[[\]]/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);

export const isRecord = (page: string) => expenseFields(page) !== null;
export { expenseFields, pageField, paymentStatus };

/** Paths of the Records (summaries with an `expense` block) that cite `id`. */
export function recordsCiting(wiki: Wiki, id: string): string[] {
  return [...wiki]
    .filter(
      ([path, body]) =>
        path.startsWith("summaries/") && isRecord(body) && cites(body, id)
    )
    .map(([path]) => path);
}

export function records(wiki: Wiki): string[] {
  return [...wiki]
    .filter(([path, body]) => path.startsWith("summaries/") && isRecord(body))
    .map(([path]) => path);
}

/** The summary Page for Source `id`: its own path, or any summary citing it. */
export function summaryOf(wiki: Wiki, id: string): string | null {
  const own = `summaries/${id}.md`;
  if (wiki.has(own)) return own;
  for (const [path, body] of wiki)
    if (path.startsWith("summaries/") && cites(body, id)) return path;
  return null;
}

/** Log lines (without the leading "- ") of type `type` and subject `subject`. */
export function logLines(wiki: Wiki, type: string, subject: string): string[] {
  return (wiki.get("log.md") ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2))
    .filter((line) => line.includes(` ${type} [${subject}]`));
}

/** Log lines of `type [subject]` the session added to the seed. */
export const addedLogLines = (
  before: Wiki,
  after: Wiki,
  type: string,
  subject: string
) =>
  logLines(after, type, subject).length -
  logLines(before, type, subject).length;

/** Lowercase alphanumeric words, for loose value matching. */
export const words = (text: string) =>
  text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** True when every word of `value` appears, in order, in `text`. */
export function mentions(text: string, value: string): boolean {
  const want = words(value);
  const have = words(text);
  for (let i = 0; i + want.length <= have.length; i++)
    if (want.every((w, j) => have[i + j] === w)) return true;
  return false;
}
