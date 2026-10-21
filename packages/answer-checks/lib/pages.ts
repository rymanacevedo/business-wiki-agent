import { matches, type Pattern } from "./answer";

const WIKI_LINK = /\]\(\/wiki\/([^)\s#]+)\)/g;

function decoded(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/**
 * The Pages a judge reads to grade one answer, sorted: the Index (every Query
 * starts there), each Page whose path a `cites` pattern matches (a Source id
 * matches its summary), and each `/wiki/<path>` Page the answer links. Only
 * paths in `wikiPaths` (the session's Wiki) are returned.
 */
export function judgedPages(
  cites: readonly Pattern[],
  answer: string,
  wikiPaths: readonly string[]
): string[] {
  const linked = new Set(
    [...answer.matchAll(WIKI_LINK)].map((m) => decoded(m[1]!))
  );
  return wikiPaths
    .filter(
      (path) =>
        path === "index.md" ||
        linked.has(path) ||
        cites.some((pattern) => matches(pattern, path))
    )
    .sort();
}
