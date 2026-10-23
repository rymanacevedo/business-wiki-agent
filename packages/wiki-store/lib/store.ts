import type { Backend, Entry } from "./backend";
import { WikiReadOnlyError } from "./errors";
import {
  checkNamespace,
  checkPath,
  checkPrefix,
  isCache,
  isSource,
} from "./paths";

/** A path under a prefix with the etag its next write must present. */
export type ManifestEntry = { path: string; etag: string };

export type WikiStore = {
  read(path: string): Promise<Entry | null>;
  write(
    path: string,
    body: string,
    options: { etag: string | null }
  ): Promise<{ etag: string }>;
  list(prefix: string): Promise<string[]>;
  manifest(prefix: string): Promise<ManifestEntry[]>;
};

export function namespacedStore(
  backend: Backend,
  namespace: string
): WikiStore {
  const base = `${checkNamespace(namespace)}/`;
  return {
    async read(path) {
      return backend.get(base + checkPath(path));
    },
    async write(path, body, { etag }) {
      if (isSource(checkPath(path))) throw new WikiReadOnlyError(path);
      return backend.put(base + path, body, etag);
    },
    async list(prefix) {
      const keys = await backend.list(base + checkPrefix(prefix));
      return keys
        .map((key) => key.slice(base.length))
        .filter((path) => !isCache(path));
    },
    async manifest(prefix) {
      const entries = await backend.manifest(base + checkPrefix(prefix));
      return entries
        .map(({ key, etag }) => ({ path: key.slice(base.length), etag }))
        .filter(({ path }) => !isCache(path));
    },
  };
}
