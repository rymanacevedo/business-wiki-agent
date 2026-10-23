import type { WikiStore } from "../wiki-store";
import { lexicalIndex, type Bm25Options, type LexicalIndex } from "./lib/bm25";
import { MAX_MATCHES, MAX_PAGES, matches } from "./lib/matches";
import { createLinkTable } from "./lib/links";
import { createMemo, type MemoPage } from "./lib/memo";
import { neighbourhood as hop, type Reach } from "./lib/neighbourhood";
import type { RetrievalResult } from "./lib/result";

export type { ResultPage, RetrievalResult } from "./lib/result";
export type { Reach } from "./lib/neighbourhood";
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
  /**
   * Add the Neighbourhood: the Pages one Link from a Match, after every
   * Match, up to 8 Pages in all. Off unless `true`; `hopRan` says whether it ran.
   */
  neighbourhood?: boolean;
};

/** Texts to vectors. Not used yet: the embedding Rung reads it. */
export type Embed = (texts: string[]) => Promise<number[][]>;

export type RetrievalOptions = {
  store: WikiStore;
  embed?: Embed;
  /** BM25 parameters; defaults `k1 = 1.2`, `b = 0.5`. */
  bm25?: Bm25Options;
  /** Matches scoring under this fraction of the top score drop; default a third. */
  matchFloor?: number;
  /**
   * How neighbours rank by reach: `{ rule: "count" }` (the default, distinct
   * reaching Matches) or `{ rule: "weighted", floor }` for the bench.
   */
  reach?: Reach;
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
 * section index and the Link table between calls and revalidates them
 * against the store's etag manifest on every call, so edits are searchable
 * (and linked) at once.
 */
export function createRetrieval({
  store,
  bm25,
  matchFloor = 1 / 3,
  reach = { rule: "count" },
}: RetrievalOptions): Retrieval {
  const memo = createMemo(store);
  const links = createLinkTable();
  let linked = -1;
  /** The Neighbourhood of `found`, the Link table first brought level with the memo. */
  const neighbours = (
    found: RetrievalResult["pages"],
    pages: Map<string, MemoPage>,
    version: number
  ) => {
    if (version !== linked) {
      links.update(pages);
      linked = version;
    }
    return hop(found, pages, links, { room: MAX_PAGES - found.length, reach });
  };
  let index: LexicalIndex | null = null;
  let indexed = -1;
  return {
    async search({ query, kind, limit = MAX_MATCHES, neighbourhood = false }) {
      const { pages, version } = await memo.refresh();
      if (!index || version !== indexed) {
        index = lexicalIndex(
          [...pages.values()].flatMap((p) => p.sections),
          bm25
        );
        indexed = version;
      }
      const found = matches(index.rank(query), pages, index, {
        query,
        kind,
        limit: Math.max(0, Math.min(limit, MAX_MATCHES, MAX_PAGES)),
        matchFloor,
      });
      const near = neighbourhood ? neighbours(found, pages, version) : [];
      return {
        rung: "lexical",
        degraded: false,
        hopRan: neighbourhood,
        pages: [...found, ...near],
      };
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
