import { BlobError, BlobPreconditionFailedError } from "@vercel/blob";
import type { BlobClient } from "../index";

/**
 * An in-memory private Vercel Blob store standing in for `@vercel/blob` at
 * the network edge. It enforces what the real service does for this store:
 * private access only, no silent overwrite, `ifMatch` against the current
 * etag, paginated `list`. Reads that could be served stale from the CDN
 * (anything without `useCache: false`) are refused, so a backend that forgets
 * it fails here rather than lagging 60 seconds in production.
 */
export function fakeBlob(pageSize = 2) {
  const blobs = new Map<string, { body: string; etag: string }>();
  let version = 0;
  const calls = { get: 0, put: 0, list: 0, del: 0 };

  const client: BlobClient = {
    async get(pathname, options) {
      calls.get++;
      if (options.access !== "private")
        throw new BlobError("this store is private");
      if (options.useCache !== false)
        throw new Error("fake Blob: read without useCache: false may be stale");
      const blob = blobs.get(pathname);
      if (!blob) return null;
      return {
        stream: new Response(blob.body).body!,
        blob: { etag: blob.etag },
      };
    },
    async put(pathname, body, options) {
      calls.put++;
      if (options.access !== "private")
        throw new BlobError("this store is private");
      if (options.addRandomSuffix !== false)
        throw new Error("fake Blob: pathnames must be stable");
      const current = blobs.get(pathname);
      if (options.ifMatch !== undefined) {
        if (current?.etag !== options.ifMatch)
          throw new BlobPreconditionFailedError();
      } else if (current && !options.allowOverwrite) {
        throw new BlobError(
          "This blob already exists, use `allowOverwrite: true` if you want to overwrite it."
        );
      }
      const etag = `"v${++version}"`;
      blobs.set(pathname, { body, etag });
      return { etag };
    },
    async list({ prefix = "", cursor, limit = pageSize }) {
      calls.list++;
      const keys = [...blobs.keys()].filter((key) => key.startsWith(prefix));
      // The real service returns pages in its own order: not sorted.
      keys.reverse();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + Math.min(limit, pageSize));
      const next = start + page.length;
      return {
        blobs: page.map((pathname) => ({
          pathname,
          etag: blobs.get(pathname)!.etag,
        })),
        hasMore: next < keys.length,
        cursor: next < keys.length ? String(next) : undefined,
      };
    },
    async del(pathnames) {
      calls.del++;
      for (const pathname of [pathnames].flat()) blobs.delete(pathname);
    },
  };
  return { client, blobs, calls };
}
