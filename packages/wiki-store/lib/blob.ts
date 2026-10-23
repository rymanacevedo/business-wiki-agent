import * as vercelBlob from "@vercel/blob";
import { BlobError, BlobPreconditionFailedError } from "@vercel/blob";
import { byKey, type Backend, type KeyEtag } from "./backend";
import { WikiConflictError } from "./errors";

/**
 * The slice of `@vercel/blob` the Blob backend calls. Credentials come from
 * the environment as the SDK resolves them: `BLOB_STORE_ID` with Vercel OIDC
 * (`VERCEL_OIDC_TOKEN`) or `BLOB_READ_WRITE_TOKEN`.
 */
export type BlobClient = {
  get(
    pathname: string,
    options: { access: "private"; useCache: false }
  ): Promise<{
    stream: ReadableStream<Uint8Array> | null;
    blob: { etag: string };
  } | null>;
  put(
    pathname: string,
    body: string,
    options: {
      access: "private";
      addRandomSuffix: false;
      allowOverwrite: boolean;
      ifMatch?: string;
      contentType: string;
    }
  ): Promise<{ etag: string }>;
  list(options: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    blobs: { pathname: string; etag: string }[];
    cursor?: string;
    hasMore: boolean;
  }>;
  del(pathnames: string[]): Promise<void>;
};

/** Every key lives under this prefix of the store. */
const ROOT = "wiki/";
const DELETE_BATCH = 100;

/**
 * Private Vercel Blob storage under `wiki/<key>` (ADR 0001). Reads skip the
 * CDN cache (`useCache: false`) so an overwrite is visible at once; writes
 * present the last etag with `ifMatch`, or create without `allowOverwrite`.
 */
export function blobBackend(client: BlobClient = vercelBlob): Backend {
  return {
    async get(key) {
      const result = await client.get(ROOT + key, {
        access: "private",
        useCache: false,
      });
      if (!result?.stream) return null;
      const body = await new Response(result.stream).text();
      return { body, etag: strong(result.blob.etag) };
    },
    async put(key, body, ifMatch) {
      try {
        const { etag } = await client.put(ROOT + key, body, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: ifMatch !== null,
          ...(ifMatch !== null && { ifMatch }),
          contentType: contentType(key),
        });
        return { etag };
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError)
          throw new WikiConflictError(key);
        // A create-only put fails when the key exists; the service reports
        // that as a plain BlobError, so confirm by reading.
        if (
          ifMatch === null &&
          error instanceof BlobError &&
          (await this.get(key)) !== null
        )
          throw new WikiConflictError(key);
        throw error;
      }
    },
    async list(prefix) {
      return (await this.manifest(prefix)).map(({ key }) => key);
    },
    // The listing already carries each blob's etag: one list operation per
    // 1,000 keys, no reads.
    async manifest(prefix) {
      const entries: KeyEtag[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.list({ prefix: ROOT + prefix, cursor });
        entries.push(
          ...page.blobs.map((blob) => ({
            key: blob.pathname.slice(ROOT.length),
            etag: blob.etag,
          }))
        );
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return entries.sort(byKey);
    },
    async remove(keys) {
      for (let i = 0; i < keys.length; i += DELETE_BATCH)
        await client.del(
          keys.slice(i, i + DELETE_BATCH).map((key) => ROOT + key)
        );
    },
  };
}

/**
 * `get` reports a weak etag (`W/"..."`) for a body of about 1 KB or more,
 * which the service sends compressed; `list`, `head` and `put` report the
 * strong one. Keep the strong form so a read's etag matches the manifest's
 * and is a valid `ifMatch`.
 */
function strong(etag: string): string {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function contentType(key: string): string {
  if (key.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/markdown; charset=utf-8";
}
