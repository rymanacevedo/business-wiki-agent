import type { Backend } from "./backend";

/**
 * Private Vercel Blob storage under `wiki/<key>` (ADR 0001). Stub until the
 * deploy ticket: it will read with `useCache: false`, write with
 * `allowOverwrite` and `ifMatch` (mapping `BlobPreconditionFailedError` to
 * WikiConflictError), and list with `list({ prefix })`.
 */
export function blobBackend(): Backend {
  const unavailable = async (): Promise<never> => {
    throw new Error(
      "The Blob backend is not implemented yet; unset VERCEL to use the local directory"
    );
  };
  return { get: unavailable, put: unavailable, list: unavailable };
}
