// Sections to Matches: collapse to Pages by best section, filter, cap, excerpt.

import type { LexicalIndex, SectionHit } from "./bm25";
import { kindRank } from "./kinds";
import type { MemoPage } from "./memo";
import type { ResultPage } from "./result";
import type { Section } from "./sections";
import { tokenise } from "./tokens";

export const MAX_PAGES = 8;
export const MAX_MATCHES = 5;
const EXCERPT_LINES = 3;
/** Frontmatter facts that stay indexed but never fill an excerpt slot. */
const NOT_EXCERPT = /^(title|sources|kind|status|flags): /;

/**
 * Up to three excerpt lines: the lines carrying the most Query weight (sum
 * of IDF over the Query tokens they hold), padded with the section's leading
 * lines, shown in document order.
 */
function excerpt(
  section: Section,
  terms: string[],
  idf: (t: string) => number
): string[] {
  const candidates = section.lines
    .map((line, i) => {
      const tokens = new Set(tokenise(line));
      const score = terms
        .filter((t) => tokens.has(t))
        .reduce((sum, t) => sum + idf(t), 0);
      return { line, i, score };
    })
    .filter(({ line }) => !NOT_EXCERPT.test(line));
  const chosen = candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, EXCERPT_LINES);
  for (const c of candidates) {
    if (chosen.length >= EXCERPT_LINES) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.i - b.i).map((c) => c.line);
}

export type MatchOptions = {
  query: string;
  kind?: string;
  limit: number;
  /** Drop Pages whose best section scores under this fraction of the top section. */
  matchFloor: number;
  /** Order the Matches by the kind prior first, fused rank second. */
  kindPrior: boolean;
};

/** Ranked section hits to at most `limit` Match Pages. */
export function matches(
  hits: SectionHit[],
  pages: ReadonlyMap<string, MemoPage>,
  index: LexicalIndex,
  { query, kind, limit, matchFloor, kindPrior }: MatchOptions
): ResultPage[] {
  const terms = [...new Set(tokenise(query, { query: true }))];
  const floor = (hits[0]?.score ?? 0) * matchFloor;
  const out: ResultPage[] = [];
  const seen = new Set<string>();
  for (const { section, score } of hits) {
    if (out.length >= limit || score < floor) break;
    const page = pages.get(section.path);
    if (!page || seen.has(page.path)) continue;
    seen.add(page.path);
    if (kind && page.kind !== kind) continue;
    out.push({
      path: page.path,
      title: page.title,
      kind: page.kind,
      status: page.status,
      role: "match",
      ...(section.heading === undefined ? {} : { heading: section.heading }),
      excerpt: excerpt(section, terms, index.idf),
      score,
    });
  }
  // A stable sort: within a kind, fused order stands.
  return kindPrior
    ? out.sort((a, b) => kindRank(a.kind) - kindRank(b.kind))
    : out;
}
