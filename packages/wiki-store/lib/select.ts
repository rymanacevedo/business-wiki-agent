import type { Backend } from "./backend";
import { blobBackend, type BlobClient } from "./blob";
import { localBackend, localRoot } from "./local";

export type Env = Record<string, string | undefined>;
export type BackendName = "blob" | "local";

/**
 * `VERCEL` selects Blob, except under `eve dev` and `eve eval`, whose server
 * process always has `EVE_DEV=1` (eve 0.80.1): evals never touch Blob.
 */
export function backendName(env: Env): BackendName {
  return env.VERCEL && env.EVE_DEV !== "1" ? "blob" : "local";
}

export function selectBackend(env: Env, blob?: BlobClient): Backend {
  return backendName(env) === "blob"
    ? blobBackend(blob)
    : localBackend(localRoot(env));
}
