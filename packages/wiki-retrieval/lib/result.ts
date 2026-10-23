// The typed result of a search (decision #46): what evals and traces read.
// The model sees only its rendering.

export type ResultPage = {
  path: string;
  title: string;
  kind: string;
  status: string;
  role: "match" | "neighbour";
  /** Matches only: the best section's `##` heading; absent for the opening section. */
  heading?: string;
  /** Matches only: up to three lines of the best section. */
  excerpt?: string[];
  /** Neighbours only: each reaching Match and the Link labels from it. */
  via?: Array<{ match: string; labels: string[] }>;
  score: number;
};

export type RetrievalResult = {
  /** The highest text Rung that contributed. */
  rung: "lexical" | "embedding";
  /** True only when the embedding Rung threw during this call. */
  degraded: boolean;
  /** Whether the one-Link hop to the Neighbourhood ran. */
  hopRan: boolean;
  /** Matches in ranked order, then neighbours; at most 8 Pages. */
  pages: ResultPage[];
};
