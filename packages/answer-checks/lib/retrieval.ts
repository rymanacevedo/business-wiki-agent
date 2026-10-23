import { matches, type Pattern } from "./answer";

/** One tool call from a turn: its name and its full `execute` output. */
export type ToolCallOutput = { name: string; output: unknown };

/**
 * A Query row's Rung metrics, each 0 or 1. The two `expected_*` metrics are
 * present only for a row with `cites`.
 */
export type RetrievalMetrics = {
  searched: number;
  rung_embedding: number;
  hop_added: number;
  expected_in_result?: number;
  expected_via_hop_only?: number;
};

type Search = {
  rung: string;
  hopRan: boolean;
  matches: string[];
  neighbours: string[];
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];

function searchOf(call: ToolCallOutput): Search | undefined {
  if (call.name !== "search_wiki") return undefined;
  const out = call.output;
  if (typeof out !== "object" || out === null || Array.isArray(out))
    return undefined;
  const o = out as Record<string, unknown>;
  return {
    rung: typeof o.rung === "string" ? o.rung : "",
    hopRan: o.hopRan === true,
    matches: strings(o.matches),
    neighbours: strings(o.neighbours),
  };
}

const bit = (b: boolean) => (b ? 1 : 0);

/**
 * What retrieval did in one row, read from `search_wiki`'s structured outputs
 * (never its rendered text) across every call. `cites` keeps the dataset's
 * semantics: every top-level entry is required, a nested list is any-of, and
 * each matches result paths by substring (a Source id names its summary Page).
 */
export function retrievalMetrics(
  cites: readonly Pattern[],
  calls: readonly ToolCallOutput[]
): RetrievalMetrics {
  const searches = calls.flatMap((c) => searchOf(c) ?? []);
  const metrics: RetrievalMetrics = {
    searched: bit(calls.some((c) => c.name === "search_wiki")),
    rung_embedding: bit(searches.some((s) => s.rung === "embedding")),
    hop_added: bit(searches.some((s) => s.hopRan && s.neighbours.length > 0)),
  };
  if (cites.length === 0) return metrics;

  const matched = searches.flatMap((s) => s.matches);
  const neighbours = searches.flatMap((s) => s.neighbours);
  const found = (pattern: Pattern, paths: string[]) =>
    paths.some((path) => matches(pattern, path));
  const inMatches = cites.map((p) => found(p, matched));
  const inNeighbours = cites.map((p) => found(p, neighbours));
  const inResult = cites.every((_, i) => inMatches[i] || inNeighbours[i]);
  metrics.expected_in_result = bit(inResult);
  metrics.expected_via_hop_only = bit(
    inResult && cites.some((_, i) => !inMatches[i] && inNeighbours[i])
  );
  return metrics;
}
