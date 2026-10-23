import type { WikiStore } from "../wiki-store";
import { lexicalIndex, type Bm25Options, type LexicalIndex } from "./lib/bm25";
import {
  embedChecked,
  missing,
  parseCache,
  record,
  serialiseCache,
  type Embed,
} from "./lib/embeddings";
import { fuse } from "./lib/fusion";
import { MAX_MATCHES, MAX_PAGES, matches } from "./lib/matches";
import { createMemo, indexable, parsePage, type MemoPage } from "./lib/memo";
import type { RetrievalResult } from "./lib/result";
import { createSemantic, EmbedUnavailable } from "./lib/semantic";

export type { ResultPage, RetrievalResult } from "./lib/result";
export { renderResult } from "./lib/render";

/** The Page kinds a Match can have: the Schema's kinds less the scaffolding. */
export const MATCH_KINDS = [
  "profile",
  "summary",
  "entity",
  "obligation",
  "ledger",
] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export type SearchOptions = {
  query: string;
  /** Filters Matches only. */
  kind?: MatchKind;
  /** Most Matches to return, at most (and by default) 5. */
  limit?: number;
  /** Run the one-Link hop to the Neighbourhood. Not built yet: `hopRan` stays false. */
  neighbourhood?: boolean;
};

export type { Embed } from "./lib/embeddings";
export {
  CACHE_PATH,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./lib/embeddings";
export { EMBED_PER_SEARCH } from "./lib/semantic";

export type RetrievalOptions = {
  store: WikiStore;
  /**
   * Texts to vectors (the Gateway adapter in `gateway.ts`, or a fake). Omit
   * it and the instance is lexical-only by configuration.
   */
  embed?: Embed;
  /** BM25 parameters; defaults `k1 = 1.2`, `b = 0.5`. */
  bm25?: Bm25Options;
  /** Matches scoring under this fraction of the top score drop; default a third. */
  matchFloor?: number;
};

/** The Schema's flags. */
export type Flag = "conflict" | "suspicious-content" | "needs-owner";

export type FlaggedPage = { path: string; kind: string; status: string };

export type Retrieval = {
  /** Rank the Wiki's sections for a Query; the store is re-checked first. */
  search(options: SearchOptions): Promise<RetrievalResult>;
  /** Every Page carrying `flag`, sorted by path: exhaustive, not ranked. */
  flagged(flag: Flag): Promise<FlaggedPage[]>;
};

/**
 * Retrieval over one WikiStore's Pages (never `index.md`, `log.md`,
 * `SCHEMA.md` or `sources/`). Keep one instance per namespace: it holds the
 * section index between calls and revalidates it against the store's etag
 * manifest on every call, so edits are searchable at once.
 */
let warned = false;

/** One warning per process, however many searches degrade. */
function warnDegraded(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    `wiki-retrieval: semantic matching unavailable, keyword matches only: ${error instanceof Error ? error.message : String(error)}`
  );
}

export function createRetrieval({
  store,
  embed,
  bm25,
  matchFloor = 1 / 3,
}: RetrievalOptions): Retrieval {
  const memo = createMemo(store);
  const semantic = embed && createSemantic(store, embed);
  // The index of the newest Snapshot seen, kept between calls.
  let built: { version: number; index: LexicalIndex } | null = null;
  return {
    async search({ query, kind, limit = MAX_MATCHES }) {
      // One Snapshot answers the whole search: hits, Page metadata and
      // excerpts. `pages` and `index` are locals, so a refresh by another
      // call while this one awaits the embedding Rung cannot reach them.
      const { pages, version } = await memo.refresh();
      if (built?.version !== version)
        built = {
          version,
          index: lexicalIndex(
            [...pages.values()].flatMap((p) => p.sections),
            bm25
          ),
        };
      const { index } = built;
      const lexical = index.rank(query);
      let hits = lexical;
      let rung: RetrievalResult["rung"] = "lexical";
      let degraded = false;
      if (semantic) {
        try {
          const nearest = await semantic.rank(query, pages);
          // With one ranker RRF is a monotone transform: lexical passes through.
          if (nearest.length > 0) {
            hits = fuse(lexical, nearest);
            rung = "embedding";
          }
        } catch (error) {
          if (!(error instanceof EmbedUnavailable)) throw error;
          degraded = true;
          warnDegraded(error);
        }
      }
      const found = matches(hits, pages, index, {
        query,
        kind,
        limit: Math.max(0, Math.min(limit, MAX_MATCHES, MAX_PAGES)),
        matchFloor,
      });
      return { rung, degraded, hopRan: false, pages: found };
    },
    async flagged(flag) {
      const { pages } = await memo.refresh();
      return [...pages.values()]
        .filter((p) => p.flags.includes(flag))
        .map(({ path, kind, status }) => ({ path, kind, status }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
  };
}

/**
 * The fixture embed step: the cache file body for a whole Wiki (and how
 * many sections it had to embed), every
 * section of every indexable Page embedded (Sources and scaffolding never),
 * keyed by the content hash the search side computes. Vectors in `previous`
 * still current for their Page are kept, so a rerun embeds only what changed.
 */
export async function embedWiki({
  pages,
  embed,
  previous,
}: {
  /** Path to file body, as stored. */
  pages: Map<string, string>;
  embed: Embed;
  previous?: string | null;
}): Promise<{ body: string; embedded: number }> {
  const parsed = new Map<string, MemoPage>();
  for (const [path, body] of pages)
    if (indexable(path)) parsed.set(path, parsePage(path, body, ""));
  const vectors = parseCache(previous);
  const todo = missing(vectors, parsed.values());
  record(
    vectors,
    parsed,
    todo,
    await embedChecked(
      embed,
      todo.map((s) => s.text)
    )
  );
  return { body: serialiseCache(vectors), embedded: todo.length };
}
