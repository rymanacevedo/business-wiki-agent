import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { byKey, type Backend, type Entry } from "./backend";
import { WikiConflictError } from "./errors";

/** The local store's root directory: `WIKI_STORE_DIR`, else `./.wiki-store`. */
export function localRoot(env: Record<string, string | undefined>): string {
  // The ignore comment keeps Next.js from tracing the whole repo into the
  // wiki browser function; on Vercel the store is Blob, never this path.
  return resolve(/*turbopackIgnore: true*/ env.WIKI_STORE_DIR ?? ".wiki-store");
}

/**
 * Etag checks and writes on one file are serialized per process. `eve dev`
 * and `eve eval` run tools in a single process, so that is the whole race.
 */
const locks = new Map<string, Promise<unknown>>();

function serialized<T>(file: string, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(file) ?? Promise.resolve();
  const next = previous.then(run, run);
  const settled = next.catch(() => undefined);
  locks.set(file, settled);
  void settled.then(() => {
    if (locks.get(file) === settled) locks.delete(file);
  });
  return next;
}

/** A directory on disk; each key is a file path relative to `root`. */
export function localBackend(root: string): Backend {
  return {
    async get(key) {
      return readEntry(join(root, key));
    },
    put(key, body, ifMatch) {
      const file = join(root, key);
      return serialized(file, async () => {
        const current = await readEntry(file);
        if ((current?.etag ?? null) !== ifMatch)
          throw new WikiConflictError(key);
        await mkdir(dirname(file), { recursive: true });
        // Namespaces never start with ".", so temp files never show in a list.
        const temp = join(root, ".tmp", randomUUID());
        await mkdir(dirname(temp), { recursive: true });
        await writeFile(temp, body);
        await rename(temp, file);
        return { etag: etagOf(body) };
      });
    },
    async list(prefix) {
      return (await walk(root))
        .map((file) => relative(root, file).split(sep).join("/"))
        .filter((key) => key.startsWith(prefix))
        .sort();
    },
    // The same content hash `get` returns, so it costs a read of every file.
    async manifest(prefix) {
      const keys = await this.list(prefix);
      const entries = await Promise.all(
        keys.map(async (key) => {
          const entry = await readEntry(join(root, key));
          return entry && { key, etag: entry.etag };
        })
      );
      return entries.filter((entry) => entry !== null).sort(byKey);
    },
    async remove(keys) {
      await Promise.all(
        keys.map((key) => rm(join(root, key), { force: true }))
      );
    },
  };
}

async function readEntry(file: string): Promise<Entry | null> {
  try {
    const body = await readFile(file, "utf8");
    return { body, etag: etagOf(body) };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function etagOf(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : [join(dir, entry.name)]
    )
  );
  return files.flat();
}
