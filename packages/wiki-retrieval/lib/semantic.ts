// The embedding Rung of one instance: the cache held in memory, delta
// embedding inside `search`, and the etag-guarded write back to the store.

import type { WikiStore } from "../../wiki-store";
import type { SectionHit } from "./bm25";
import {
  CACHE_PATH,
  embedChecked,
  missing,
  nearest,
  parseCache,
  record,
  serialiseCache,
  type EmbeddablePage,
  type Embed,
  type Vectors,
} from "./embeddings";
import { FUSE_TOP } from "./fusion";

/** Thrown when the adapter fails: the one failure that degrades a search. */
export class EmbedUnavailable extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "EmbedUnavailable";
  }
}

/** Most sections embedded in one search; the rest are lexical-only for that call. */
export const EMBED_PER_SEARCH = 20;

export type Semantic = {
  /**
   * The sections nearest the query. Embeds the query once and at most 20
   * sections whose Page is new or changed, then persists them. Throws
   * `EmbedUnavailable` when `embed` fails; a cache that cannot be read
   * throws its own error, which fails the search rather than degrading it.
   */
  rank(
    query: string,
    pages: ReadonlyMap<string, EmbeddablePage>
  ): Promise<SectionHit[]>;
};

export function createSemantic(store: WikiStore, embed: Embed): Semantic {
  let vectors: Vectors | null = null;
  let etag: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Vectors> {
    if (vectors) return vectors;
    const entry = await store.read(CACHE_PATH);
    etag = entry?.etag ?? null;
    return (vectors = parseCache(entry?.body));
  }

  async function persist(next: Vectors) {
    try {
      etag = (await store.write(CACHE_PATH, serialiseCache(next), { etag }))
        .etag;
    } catch {
      // The loser of a race (or a failed write) drops its write; reload the
      // file on the next search, which redoes whatever delta is still missing.
      vectors = null;
    }
  }

  async function rank(
    query: string,
    pages: ReadonlyMap<string, EmbeddablePage>
  ) {
    // `pages` is the search's Snapshot, so every vector recorded here carries
    // the hash of the text it was made from, whatever refreshes meanwhile.
    const cache = await load();
    const todo = missing(cache, pages.values()).slice(0, EMBED_PER_SEARCH);
    let queryVector: Float32Array;
    let fresh: Float32Array[];
    try {
      [[queryVector], fresh] = await Promise.all([
        embedChecked(embed, [query]),
        embedChecked(
          embed,
          todo.map((s) => s.text)
        ),
      ]);
    } catch (error) {
      throw new EmbedUnavailable(error);
    }
    if (todo.length > 0) {
      record(cache, pages, todo, fresh);
      await persist(cache);
    }
    return nearest(cache, pages.values(), queryVector, FUSE_TOP);
  }

  return {
    rank(query, pages) {
      // One at a time per instance, so two searches never race each other's write.
      const run = queue.then(() => rank(query, pages));
      queue = run.catch(() => {});
      return run;
    },
  };
}
