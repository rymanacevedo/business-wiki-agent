import { WikiConflictError, type WikiStore } from "../../packages/wiki-store";
import { clerkConfig, SOURCES } from "./config";

export const LOG = "log.md";
export const SCHEMA = "SCHEMA.md";

/** Normalize a model-supplied Page path and refuse anything that is not a Page. */
export function pagePath(path: string): string {
  const clean = path.trim().replace(/^\/?(wiki\/)?/, "");
  if (clean.startsWith(SOURCES))
    throw new Error("Sources are immutable: no tool writes under sources/.");
  if (!clean.endsWith(".md"))
    throw new Error(`Page paths end in .md, got ${clean}.`);
  return clean;
}

/** Stamp the frontmatter `updated:` field with the Demo Date, if present. */
export function touch(page: string): string {
  const end = page.startsWith("---\n") ? page.indexOf("\n---", 4) : -1;
  if (end === -1) return page;
  const frontmatter = page
    .slice(0, end)
    .replace(/^updated:.*$/m, `updated: ${clerkConfig.demoDate}`);
  return frontmatter + page.slice(end);
}

/** One Log line in the Schema's shape. */
export function logLine(
  type: string,
  subject: string | undefined,
  detail: string
) {
  const tag = subject ? ` [${subject}]` : "";
  // Models sometimes repeat the line's own prefix inside the detail.
  const text = detail.replace(
    /^-?\s*\d{4}-\d{2}-\d{2}\s+[A-Z]+(\s+\[[^\]]*\])?:\s*/,
    ""
  );
  return `- ${clerkConfig.demoDate} ${type}${tag}: ${text.replace(/\s*\n\s*/g, " ").trim()}`;
}

/** Append a line to a Log body; a replayed append of the last line is a no-op. */
export function appendLine(log: string, line: string): string {
  const trimmed = log.replace(/\s+$/, "");
  if (trimmed.endsWith(line)) return log;
  return `${trimmed}\n${line}\n`;
}

/**
 * Append one line to the Log, re-reading on a conflict: the model may append
 * several lines in parallel in one step.
 */
export async function appendLog(store: WikiStore, line: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const log = await store.read(LOG);
    if (!log) throw new Error("The Wiki has no log.md.");
    try {
      await store.write(LOG, appendLine(log.body, line), { etag: log.etag });
      return;
    } catch (error) {
      if (!(error instanceof WikiConflictError) || attempt >= 4) throw error;
    }
  }
}

/**
 * The lines that differ between an old and a new value, dropping their common
 * leading and trailing lines, so an Approval card shows only what changes.
 */
export function changedLines(
  oldValue: string,
  newValue: string
): { old: string; new: string } {
  const a = oldValue.trim().split("\n");
  const b = newValue.trim().split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const pick = (lines: string[]) =>
    lines
      .slice(start, lines.length - end)
      .map((line) => line.trim())
      .join(" / ") || "(nothing)";
  return { old: pick(a), new: pick(b) };
}
