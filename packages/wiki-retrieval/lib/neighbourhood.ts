// One Link hop from the Matches (decision #46, items 2, 4, 9, 10).

import { kindRank as prior } from "./kinds";
import type { LinkView } from "./links";
import type { MemoPage } from "./memo";
import type { ResultPage } from "./result";

/**
 * How neighbours rank by reach. `count` (the default): the number of
 * distinct Matches reaching them. `weighted`: the sum of 1 / (Pages one Link
 * from the Match) over the reaching Matches, so a hub's reach counts less;
 * neighbours under `floor` drop.
 */
export type Reach = { rule: "count" } | { rule: "weighted"; floor: number };

/** The Neighbourhood of `matches`, ranked, at most `room` Pages. */
export function neighbourhood(
  matches: ResultPage[],
  pages: ReadonlyMap<string, MemoPage>,
  links: LinkView,
  { room, reach }: { room: number; reach: Reach }
): ResultPage[] {
  const rank = new Map(matches.map((m, i) => [m.path, i]));
  const found = new Map<
    string,
    { via: { match: string; labels: string[] }[]; best: number; weight: number }
  >();
  for (const match of matches) {
    const around = links.around(match.path);
    for (const { page, labels } of around) {
      if (rank.has(page) || !pages.has(page)) continue;
      const n = found.get(page) ?? {
        via: [],
        best: rank.get(match.path)!,
        weight: 0,
      };
      n.via.push({ match: match.path, labels });
      n.weight += 1 / around.length;
      found.set(page, n);
    }
  }
  const score = (n: { via: unknown[]; weight: number }) =>
    reach.rule === "count" ? n.via.length : n.weight;
  return [...found.entries()]
    .filter(([, n]) => reach.rule === "count" || n.weight >= reach.floor)
    .map(([path, n]) => ({ path, n, page: pages.get(path)! }))
    .sort(
      (a, b) =>
        score(b.n) - score(a.n) ||
        a.n.best - b.n.best ||
        prior(a.page.kind) - prior(b.page.kind) ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    )
    .slice(0, Math.max(0, room))
    .map(({ path, n, page }) => ({
      path,
      title: page.title,
      kind: page.kind,
      status: page.status,
      role: "neighbour" as const,
      via: n.via,
      score: score(n),
    }));
}
