import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/** Every Page under `dir` (Sources skipped), keyed by its path relative to `dir`. */
export async function readWikiDir(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const pages = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const file = join(entry.parentPath, entry.name);
    const path = relative(dir, file).replaceAll("\\", "/");
    if (path.startsWith("sources/")) continue;
    pages.set(path, await readFile(file, "utf8"));
  }
  return new Map([...pages].sort(([a], [b]) => a.localeCompare(b)));
}
