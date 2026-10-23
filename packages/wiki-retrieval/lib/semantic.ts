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

/** Most sections embedded in one search; the rest are lexical-only for that call. */
export const EMBED_PER_SEARCH = 20;

export type Semantic = {
  /**
   * The sections nearest the query. Embeds the query once and at most 20
   * sections whose Page is new or changed, then persists them. Throws only
   * when `embed` does (or the cache cannot be read).
   */
  rank(
    query: string,
    pages: Map<string, EmbeddablePage>
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

  async function rank(query: string, pages: Map<string, EmbeddablePage>) {
    const cache = await load();
    const todo = missing(cache, pages.values()).slice(0, EMBED_PER_SEARCH);
    const [[queryVector], fresh] = await Promise.all([
      embedChecked(embed, [query]),
      embedChecked(
        embed,
        todo.map((s) => s.text)
      ),
    ]);
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
