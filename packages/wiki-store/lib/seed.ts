import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BlobClient } from "./blob";
import {
  backendName,
  selectBackend,
  type BackendName,
  type Env,
} from "./select";
import { checkNamespace, SOURCES_PREFIX } from "./paths";

export class WikiSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiSeedError";
  }
}

export type SeedOptions = {
  namespace: string;
  /** A Wiki fixture: Pages only, no `sources/`. */
  fixtureDir: string;
  /** The Corpus Sources, copied under `sources/`. */
  sourcesDir: string;
  /** Replace a namespace that already has content. */
  force?: boolean;
  /** Selects the backend exactly as `createWikiStore` does. */
  env?: Env;
  blob?: BlobClient;
};

/**
 * The only writer of Sources: writes straight to the backend the store would
 * use, bypassing the WikiStore and its read-only `sources/` guard.
 */
export async function seedNamespace({
  namespace,
  fixtureDir,
  sourcesDir,
  force = false,
  env = process.env,
  blob,
}: SeedOptions): Promise<{
  pages: number;
  sources: number;
  backend: BackendName;
}> {
  const base = `${checkNamespace(namespace)}/`;
  const backend = selectBackend(env, blob);
  const pages = await filesIn(fixtureDir, "fixture");
  const sources = await filesIn(sourcesDir, "sources");
  if (pages.some((path) => path.startsWith(SOURCES_PREFIX)))
    throw new WikiSeedError(
      `Fixture ${fixtureDir} contains ${SOURCES_PREFIX}; Sources come only from the Corpus`
    );
  const existing = await backend.list(base);
  if (existing.length > 0) {
    if (!force)
      throw new WikiSeedError(
        `Namespace ${namespace} already has content; pass --force to overwrite it`
      );
    await backend.remove(existing);
  }
  const files = [
    ...pages.map((path) => ({ from: join(fixtureDir, path), key: path })),
    ...sources.map((path) => ({
      from: join(sourcesDir, path),
      key: SOURCES_PREFIX + path,
    })),
  ];
  // A few at a time: Blob's Hobby plan allows 15 writes a second.
  for (let i = 0; i < files.length; i += 5)
    await Promise.all(
      files
        .slice(i, i + 5)
        .map(async ({ from, key }) =>
          backend.put(base + key, await readFile(from, "utf8"), null)
        )
    );
  return {
    pages: pages.length,
    sources: sources.length,
    backend: backendName(env),
  };
}

async function filesIn(dir: string, label: string): Promise<string[]> {
  try {
    if (!(await stat(dir)).isDirectory())
      throw new WikiSeedError(`The ${label} path ${dir} is not a directory`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw new WikiSeedError(`The ${label} directory ${dir} does not exist`);
  }
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(dir.length + 1)
        .replaceAll("\\", "/")
    )
    .sort();
}
