import type { BlobClient } from "./lib/blob";
import { selectBackend, type Env } from "./lib/select";
import { namespacedStore, type WikiStore } from "./lib/store";

export type { Entry } from "./lib/backend";
export type { BlobClient } from "./lib/blob";
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
  /**
   * `VERCEL` selects private Vercel Blob, except under `eve dev` and
   * `eve eval` (`EVE_DEV=1`), which always use the local directory
   * `WIKI_STORE_DIR` (default `.wiki-store`).
   */
  env?: Env;
  /** The Blob client; defaults to `@vercel/blob`. Tests pass a fake. */
  blob?: BlobClient;
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
  blob,
}: WikiStoreOptions): WikiStore {
  return namespacedStore(selectBackend(env, blob), namespace);
}
