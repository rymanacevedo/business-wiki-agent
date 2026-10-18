import type { Backend, Entry } from "./backend";
import { WikiReadOnlyError } from "./errors";
import { checkNamespace, checkPath, checkPrefix, isSource } from "./paths";

export type WikiStore = {
  read(path: string): Promise<Entry | null>;
  write(
    path: string,
    body: string,
    options: { etag: string | null }
  ): Promise<{ etag: string }>;
  list(prefix: string): Promise<string[]>;
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
      return keys.map((key) => key.slice(base.length));
    },
  };
}
