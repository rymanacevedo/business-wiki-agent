// Reciprocal Rank Fusion (research #45): k = 60 over each ranker's top 20
// sections, equal weights.

import type { SectionHit } from "./bm25";

export const RRF_K = 60;
export const FUSE_TOP = 20;

/** Each list's top 20 fused by RRF, best first, ties by section id. */
export function fuse(...lists: SectionHit[][]): SectionHit[] {
  const fused = new Map<string, SectionHit>();
  for (const list of lists)
    list.slice(0, FUSE_TOP).forEach(({ section }, rank) => {
      const hit = fused.get(section.id) ?? { section, score: 0 };
      hit.score += 1 / (RRF_K + rank + 1);
      fused.set(section.id, hit);
    });
  return [...fused.values()].sort(
    (x, y) => y.score - x.score || x.section.id.localeCompare(y.section.id)
  );
}
