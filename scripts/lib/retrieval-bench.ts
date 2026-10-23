// The retrieval bench (spec #53, eval story; decision #49 item 11): the
// module run directly over a Wiki for every Query row with `cites`, no agent
// and no judge, scored by mean reciprocal rank, one knob at a time.
import { matches, type Pattern } from "../../packages/answer-checks";
import {
  createRetrieval,
  type Embed,
  type Reach,
  type ResultPage,
} from "../../packages/wiki-retrieval";
import type { WikiStore } from "../../packages/wiki-store";

export type BenchRow = { caseId: string; query: string; cites: Pattern[] };

/** The bench's rows: those with `cites`, each by its last prompt. */
export function benchRows(
  cases: readonly {
    caseId: string;
    prompts: readonly string[];
    cites: readonly Pattern[];
  }[]
): BenchRow[] {
  return cases
    .filter((c) => c.cites.length > 0 && c.prompts.length > 0)
    .map((c) => ({
      caseId: c.caseId,
      query: c.prompts.at(-1)!,
      cites: [...c.cites],
    }));
}

/** A `cites` alternative that is a Source id (no folder, no `.md`, not a regex). */
const SOURCE_ID = /^[a-z0-9][a-z0-9.-]*$/i;
const isSourceId = (p: string) => SOURCE_ID.test(p) && !p.endsWith(".md");

/** One `cites` entry against one path: a Source id names its summary Page exactly. */
function entryMatches(pattern: Pattern, path: string): boolean {
  if (typeof pattern !== "string")
    return pattern.some((p) => entryMatches(p, path));
  return isSourceId(pattern)
    ? path.toLowerCase() === `summaries/${pattern.toLowerCase()}.md`
    : matches(pattern, path);
}

export type EntryRung = "lexical" | "embedding" | "hop";

export type RankedRow = {
  /** 1 over the position of the last required entry; 0 when one is missing. */
  rr: number;
  /** Per `cites` entry: its best 1-based position and the Rung that reached it, or null. */
  entries: {
    pattern: Pattern;
    position: number | null;
    rung: EntryRung | null;
  }[];
};

/**
 * Score one result against a row's `cites`: every top-level entry required,
 * a nested list any-of, matched by substring on result paths, a Source id
 * resolving to its summary Page (`summaries/<id>.md`). A neighbour's
 * Rung is the hop; a Match's is `lexical` unless the search fused and the
 * Page is not among the same configuration's lexical-only Matches.
 */
export function rankRow(
  cites: readonly Pattern[],
  pages: readonly ResultPage[],
  {
    rung = "lexical",
    lexicalMatches,
  }: { rung?: "lexical" | "embedding"; lexicalMatches?: readonly string[] } = {}
): RankedRow {
  const entries = cites.map((pattern) => {
    const i = pages.findIndex((p) => entryMatches(pattern, p.path));
    if (i === -1) return { pattern, position: null, rung: null };
    const page = pages[i]!;
    const reached: EntryRung =
      page.role === "neighbour"
        ? "hop"
        : rung === "embedding" && !lexicalMatches?.includes(page.path)
          ? "embedding"
          : "lexical";
    return { pattern, position: i + 1, rung: reached };
  });
  const positions = entries.map((e) => e.position);
  const rr = positions.every((p) => p !== null)
    ? 1 / Math.max(...(positions as number[]))
    : 0;
  return { rr, entries };
}

export type BenchConfig = {
  reach: Reach;
  matchFloor: number;
  kindPrior: boolean;
};

/** The pre-registered defaults: count rule, floor at a third, no prior. */
export const DEFAULTS: BenchConfig = {
  reach: { rule: "count" },
  matchFloor: 1 / 3,
  kindPrior: false,
};

export const KNOBS = ["reach", "floor", "prior"] as const;
export type Knob = (typeof KNOBS)[number];

/** Each knob's alternative, applied to the defaults. The weighted floor is the prototype's 0.2. */
const ALTERNATIVE: Record<Knob, Partial<BenchConfig>> = {
  reach: { reach: { rule: "weighted", floor: 0.2 } },
  floor: { matchFloor: 0 },
  prior: { kindPrior: true },
};

const TITLES: Record<Knob, { heading: string; base: string; alt: string }> = {
  reach: {
    heading: "Ordering: count rule versus degree-weighted reach",
    base: "count",
    alt: "weighted, floor 0.2",
  },
  floor: {
    heading: "Match floor: a third of the top score versus 0",
    base: "floor 1/3",
    alt: "floor 0",
  },
  prior: {
    heading: "Kind prior on Matches: off versus on",
    base: "prior off",
    alt: "prior on",
  },
};

/** `base` and each knob's alternative MRR, in, the configuration the rule picks, out. */
export function choose(
  mrr: { base: number } & Record<Knob, number>,
  combinedMrr?: number
): { chosen: BenchConfig; changed: Knob[]; combined: boolean } {
  const improving = KNOBS.filter((k) => mrr[k] > mrr.base);
  const apply = (knobs: readonly Knob[]): BenchConfig =>
    Object.assign({}, DEFAULTS, ...knobs.map((k) => ALTERNATIVE[k]));
  if (improving.length <= 1)
    return { chosen: apply(improving), changed: improving, combined: false };
  if (combinedMrr === undefined)
    throw new Error("more than one knob improves: run the combination first");
  // The best single change; on a tie, the first knob in table order.
  const best = improving.reduce((a, b) => (mrr[b] > mrr[a] ? b : a));
  return combinedMrr < mrr[best]
    ? { chosen: apply([best]), changed: [best], combined: true }
    : { chosen: apply(improving), changed: improving, combined: true };
}

export type BenchColumn = {
  label: string;
  config: BenchConfig;
  mrr: number;
  rows: (RankedRow & { caseId: string })[];
};

export type BenchReport = {
  /** True when the columns ran with the embedding Rung (the cache exists, an adapter given). */
  hybrid: boolean;
  knobs: { knob: Knob; base: BenchColumn; alternative: BenchColumn }[];
  /** The default configuration, lexical-only, for reference (hybrid benches only). */
  lexical?: BenchColumn;
  combined?: BenchColumn;
  chosen: BenchConfig;
  changed: Knob[];
};

const mean = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Run every configuration over `rows`, hop on. With `embed` the columns are
 * hybrid; a search that degrades fails the bench rather than silently
 * scoring keyword-only.
 */
export async function runBench({
  store,
  rows,
  embed,
}: {
  store: WikiStore;
  rows: readonly BenchRow[];
  embed?: Embed;
}): Promise<BenchReport> {
  async function column(
    label: string,
    config: BenchConfig,
    hybrid = embed !== undefined
  ): Promise<BenchColumn> {
    const retrieval = createRetrieval({
      store,
      ...config,
      ...(hybrid ? { embed } : {}),
    });
    const lexical = hybrid ? createRetrieval({ store, ...config }) : undefined;
    const out: BenchColumn["rows"] = [];
    for (const row of rows) {
      const ask = { query: row.query, neighbourhood: true };
      const result = await retrieval.search(ask);
      if (result.degraded)
        throw new Error(
          `the embedding Rung degraded on ${row.caseId}: check AI_GATEWAY_API_KEY, or run with --lexical`
        );
      const lexicalMatches = lexical
        ? (await lexical.search(ask)).pages
            .filter((p) => p.role === "match")
            .map((p) => p.path)
        : undefined;
      out.push({
        caseId: row.caseId,
        ...rankRow(row.cites, result.pages, {
          rung: result.rung,
          lexicalMatches,
        }),
      });
    }
    return { label, config, mrr: mean(out.map((r) => r.rr)), rows: out };
  }

  const base = await column("defaults", DEFAULTS);
  const knobs: BenchReport["knobs"] = [];
  for (const knob of KNOBS)
    knobs.push({
      knob,
      base: { ...base, label: TITLES[knob].base },
      alternative: await column(TITLES[knob].alt, {
        ...DEFAULTS,
        ...ALTERNATIVE[knob],
      }),
    });
  const mrr = {
    base: base.mrr,
    ...(Object.fromEntries(
      knobs.map((k) => [k.knob, k.alternative.mrr])
    ) as Record<Knob, number>),
  };
  const improving = KNOBS.filter((k) => mrr[k] > mrr.base);
  const combined =
    improving.length > 1
      ? await column(
          `combined: ${improving.map((k) => TITLES[k].alt).join(", ")}`,
          Object.assign({}, DEFAULTS, ...improving.map((k) => ALTERNATIVE[k]))
        )
      : undefined;
  const { chosen, changed } = choose(mrr, combined?.mrr);
  return {
    hybrid: embed !== undefined,
    knobs,
    ...(embed
      ? { lexical: await column("lexical-only", DEFAULTS, false) }
      : {}),
    ...(combined ? { combined } : {}),
    chosen,
    changed,
  };
}

/** A row's rank (— when an entry is missing), then each entry's Rung in `cites` order. */
export const cellOf = (row: RankedRow) =>
  `${row.rr === 0 ? "—" : Math.round(1 / row.rr)} · ${row.entries.map((e) => e.rung ?? "missing").join(", ")}`;
const cell = cellOf;

function table(columns: BenchColumn[]): string[] {
  const head = `| Row | ${columns.map((c) => c.label).join(" | ")} |`;
  const divider = `|---|${columns.map(() => "---|").join("")}`;
  const lines = columns[0]!.rows.map(
    (r, i) =>
      `| ${r.caseId} | ${columns.map((c) => cell(c.rows[i]!)).join(" | ")} |`
  );
  const mrr = `| **MRR** | ${columns.map((c) => c.mrr.toFixed(3)).join(" | ")} |`;
  return [head, divider, ...lines, mrr];
}

export function describeConfig(config: BenchConfig): string {
  const reach =
    config.reach.rule === "count"
      ? "count rule"
      : `degree-weighted reach, floor ${config.reach.floor}`;
  const floor =
    config.matchFloor === 0
      ? "Match floor 0"
      : "Match floor a third of the top score";
  return `${reach}; ${floor}; kind prior ${config.kindPrior ? "on" : "off"}`;
}

/** The bench as Markdown: `docs/evals/retrieval-bench.md`. */
export function renderBench(
  report: BenchReport,
  {
    fixture = "the Wiki",
    rows = report.knobs[0]?.base.rows.length ?? 0,
    model,
  }: { fixture?: string; rows?: number; model?: string } = {}
): string {
  const rung = report.hybrid
    ? `hybrid Rung (keyword and embedding Matches fused${model ? `, query vectors from \`${model}\`` : ""}), hop on`
    : "lexical-only (no embedding Rung), hop on";
  const out = [
    "# Retrieval bench",
    "",
    `Generated by \`bun run bench:retrieval\` over ${fixture}: ${rows} Query rows with \`cites\`, each by its last prompt, run through \`wiki-retrieval\` directly (no agent, no judge), ${rung}.`,
    "",
    "A cell is the row's rank (the position of the last required `cites` entry in the result, Matches then neighbours) and the Rung that reached each of its `cites` entries, in order: `lexical` (a Match the lexical-only search also returns), `embedding` (a Match only once fused), `hop` (a neighbour), `missing` (not in the result). A row's reciprocal rank is 1 over its rank, 0 when an entry is missing.",
    "",
  ];
  for (const { knob, base, alternative } of report.knobs) {
    out.push(
      `## ${TITLES[knob].heading}`,
      "",
      ...table([base, alternative]),
      ""
    );
    if (base.rows.every((r, i) => cell(r) === cell(alternative.rows[i]!)))
      out.push("The two columns rank every row identically.", "");
  }
  if (report.lexical) {
    const base = report.knobs[0]!.base;
    out.push(
      "## Reference: hybrid versus lexical-only",
      "",
      "Defaults, hop on; not a knob.",
      "",
      ...table([{ ...base, label: "hybrid" }, report.lexical]),
      ""
    );
  }
  if (report.combined)
    out.push(
      "## Combined configuration",
      "",
      ...table([report.knobs[0]!.base, report.combined]),
      ""
    );
  out.push(
    "## Chosen configuration",
    "",
    `${describeConfig(report.chosen)}.`,
    "",
    report.changed.length === 0
      ? "No knob leaves its default."
      : `Changed from the defaults: ${report.changed.map((k) => TITLES[k].alt).join(", ")}.`,
    "",
    "Rule applied (spec #53, pre-registered): each knob is varied one at a time from the defaults (count rule, floor at a third, no prior). A knob leaves its default only when its alternative strictly improves MRR; ties and a flat bench keep the defaults. When more than one knob would change, the combination is run; if it scores below the best single change, that single change alone is taken.",
    ""
  );
  if (!report.hybrid)
    out.push(
      "This bench ran lexical-only: no embedding Rung contributed to any column.",
      ""
    );
  return out.join("\n");
}
