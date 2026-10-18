import { cp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { localRoot } from "./local";
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
  env?: Record<string, string | undefined>;
};

/**
 * The only writer of Sources: copies straight into the local backend's
 * directory, bypassing the WikiStore and its read-only `sources/` guard.
 */
export async function seedNamespace({
  namespace,
  fixtureDir,
  sourcesDir,
  force = false,
  env = process.env,
}: SeedOptions): Promise<{ pages: number; sources: number }> {
  if (env.VERCEL)
    throw new WikiSeedError("Seeding the Blob backend is not implemented yet");
  const target = join(localRoot(env), checkNamespace(namespace));
  const sourcesName = SOURCES_PREFIX.slice(0, -1);
  const pages = await filesIn(fixtureDir, "fixture");
  const sources = await filesIn(sourcesDir, "sources");
  if (pages.some((path) => path.startsWith(SOURCES_PREFIX)))
    throw new WikiSeedError(
      `Fixture ${fixtureDir} contains ${SOURCES_PREFIX}; Sources come only from the Corpus`
    );
  if ((await filesIn(target, "namespace", true)).length > 0) {
    if (!force)
      throw new WikiSeedError(
        `Namespace ${namespace} already has content; pass --force to overwrite it`
      );
    await rm(target, { recursive: true, force: true });
  }
  await cp(fixtureDir, target, { recursive: true });
  await cp(sourcesDir, join(target, sourcesName), { recursive: true });
  return { pages: pages.length, sources: sources.length };
}

async function filesIn(
  dir: string,
  label: string,
  allowMissing = false
): Promise<string[]> {
  try {
    if (!(await stat(dir)).isDirectory())
      throw new WikiSeedError(`The ${label} path ${dir} is not a directory`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (allowMissing) return [];
    throw new WikiSeedError(`The ${label} directory ${dir} does not exist`);
  }
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(dir.length + 1)
        .replaceAll("\\", "/")
    );
}
