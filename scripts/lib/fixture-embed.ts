// The fixture embed step: write `cache/embeddings.json` into a fixture
// directory so seeded namespaces start warm. Runs on its own over an existing
// fixture (`wiki:build-fixture --embed-only`) and never re-runs Ingest.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  CACHE_PATH,
  embedWiki,
  type Embed,
} from "../../packages/wiki-retrieval";

/** Every fixture file but the cache, relative path to body. */
async function fixturePages(dir: string): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const path = relative(dir, file).split(sep).join("/");
    if (path.startsWith("cache/")) continue;
    pages.set(path, await readFile(file, "utf8"));
  }
  return new Map([...pages].sort(([a], [b]) => (a < b ? -1 : 1)));
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Embed every section of the fixture's Pages that the existing cache does not
 * already hold for the Page's current content, and write the cache. Touches
 * no other file.
 */
export async function embedFixture(
  dir: string,
  embed: Embed
): Promise<{ embedded: number; path: string }> {
  const path = join(dir, CACHE_PATH);
  const previous = await readOrNull(path);
  const { body, embedded } = await embedWiki({
    pages: await fixturePages(dir),
    embed,
    previous,
  });
  if (body !== previous) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  return { embedded, path };
}
