import { blobBackend } from "./lib/blob";
import { localBackend, localRoot } from "./lib/local";
import { namespacedStore, type WikiStore } from "./lib/store";

export type { Entry } from "./lib/backend";
export type { WikiStore } from "./lib/store";
export {
  WikiConflictError,
  WikiPathError,
  WikiReadOnlyError,
} from "./lib/errors";

export type WikiStoreOptions = {
  /**
   * Every path is scoped to this namespace: `demo` in production,
   * `eval/<runId>/<sessionId>` under evals. Never derive it from model input.
   * Namespaces are leaves: do not use one namespace as a prefix of another.
   */
  namespace: string;
  /** `VERCEL` selects Blob; otherwise `WIKI_STORE_DIR` (default `.wiki-store`). */
  env?: Record<string, string | undefined>;
};

/**
 * The Wiki and its read-only Sources for one namespace. `read` returns null
 * for a missing path; `write` takes the etag from the last read (null to
 * create) and throws WikiConflictError if it is stale, WikiReadOnlyError
 * under `sources/`; `list` returns the paths under a prefix, sorted.
 */
export function createWikiStore({
  namespace,
  env = process.env,
}: WikiStoreOptions): WikiStore {
  const backend = env.VERCEL ? blobBackend() : localBackend(localRoot(env));
  return namespacedStore(backend, namespace);
}
