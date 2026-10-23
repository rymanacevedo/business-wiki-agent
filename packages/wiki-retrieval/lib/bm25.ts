// Hand-rolled BM25 with Lucene's IDF (research #45, section 4).

import type { Section } from "./sections";
import { tokenise } from "./tokens";

export type Bm25Options = { k1?: number; b?: number };

export type SectionHit = { section: Section; score: number };

export type LexicalIndex = {
  /** Every section scoring above zero, best first, ties by id. */
  rank(query: string): SectionHit[];
  /** The IDF of a token, for scoring excerpt lines. */
  idf(token: string): number;
};

export function lexicalIndex(
  sections: Section[],
  { k1 = 1.2, b = 0.5 }: Bm25Options = {}
): LexicalIndex {
  const docs = sections.map((section) => {
    const tokens = tokenise(section.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { section, tf, length: tokens.length };
  });
  const df = new Map<string, number>();
  for (const doc of docs)
    for (const t of doc.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const avgdl = n === 0 ? 0 : docs.reduce((sum, d) => sum + d.length, 0) / n;
  const idf = (t: string) => {
    const freq = df.get(t) ?? 0;
    return Math.log(1 + (n - freq + 0.5) / (freq + 0.5));
  };
  return {
    idf,
    rank(query) {
      const terms = [...new Set(tokenise(query, { query: true }))];
      const hits: SectionHit[] = [];
      for (const doc of docs) {
        let score = 0;
        for (const t of terms) {
          const f = doc.tf.get(t) ?? 0;
          if (!f) continue;
          score +=
            (idf(t) * (f * (k1 + 1))) /
            (f + k1 * (1 - b + (b * doc.length) / avgdl));
        }
        if (score > 0) hits.push({ section: doc.section, score });
      }
      return hits.sort(
        (x, y) => y.score - x.score || x.section.id.localeCompare(y.section.id)
      );
    },
  };
}
