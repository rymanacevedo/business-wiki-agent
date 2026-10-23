import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CLASSES, type CaseReport, type SliceReport } from "./types";

export type Run = { label: string; slices: SliceReport[] };

/** A row whose expectation changed between the runs: a dataset fix, not an agent change. */
export type DatasetFix = { id: string; commit: string; change: string };

/** The marker pair for a README block: the default block, or `eval-diff:<name>:start/end`. */
export function markers(name?: string): { start: string; end: string } {
  const prefix = name === undefined ? "eval-diff" : `eval-diff:${name}`;
  return { start: `<!-- ${prefix}:start -->`, end: `<!-- ${prefix}:end -->` };
}

/** Every `<slice>.json` in one run directory. */
export async function readRun(runsDir: string, label: string): Promise<Run> {
  const dir = join(runsDir, label);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const slices = await Promise.all(
    files.map(
      async (f) =>
        JSON.parse(await readFile(join(dir, f), "utf8")) as SliceReport
    )
  );
  return { label, slices };
}

const cases = (run: Run, slice?: string) =>
  run.slices
    .filter((s) => slice === undefined || s.slice === slice)
    .flatMap((s) => s.cases);

const counted = (list: CaseReport[]) =>
  list.filter((c) => c.verdict !== "skipped");

function passRate(list: CaseReport[]): string {
  const run = counted(list);
  if (run.length === 0) return "n/a";
  const passed = run.filter((c) => c.verdict === "passed").length;
  return `${passed}/${run.length} (${Math.round((100 * passed) / run.length)}%)`;
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const fixed = (value: number | null, digits: number) =>
  value === null ? "n/a" : value.toFixed(digits);

function toolCalls(list: CaseReport[]): string {
  return fixed(mean(counted(list).map((c) => c.toolCalls)), 1);
}

function cost(list: CaseReport[]): string {
  const known = list.filter((c) => c.costUsd !== null);
  if (known.length === 0) return "n/a";
  return `$${known.reduce((sum, c) => sum + c.costUsd!, 0).toFixed(4)}`;
}

const failedGates = (c: CaseReport | undefined) =>
  c === undefined
    ? "(not run)"
    : c.gates
        .filter((g) => !g.passed)
        .map((g) => g.name)
        .join("; ") || "none";

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const ids = (list: CaseReport[]) => new Set(list.map((c) => c.id));

/**
 * Join two runs by eval id. `readmeBlock` is the README table (one row per
 * slice plus a total); `markdown` is `docs/evals/before-after.md`.
 */
export function diffRuns(
  before: Run,
  after: Run,
  datasetFixes: DatasetFix[] = []
): { markdown: string; readmeBlock: string } {
  const fixById = new Map(datasetFixes.map((f) => [f.id, f]));
  const unfixed = (run: Run): Run => ({
    ...run,
    slices: run.slices.map((s) => ({
      ...s,
      cases: s.cases.filter((c) => !fixById.has(c.id)),
    })),
  });
  const slices = [
    ...new Set([...before.slices, ...after.slices].map((s) => s.slice)),
  ].sort();
  const all = (run: Run) => cases(run);
  const beforeById = new Map(all(before).map((c) => [c.id, c]));
  const afterById = new Map(all(after).map((c) => [c.id, c]));

  const sliceRow = (name: string, slice?: string, runs = [before, after]) => {
    const b = cases(runs[0]!, slice);
    const a = cases(runs[1]!, slice);
    return [
      name,
      String(new Set([...ids(b), ...ids(a)]).size),
      passRate(b),
      passRate(a),
      `${toolCalls(b)} → ${toolCalls(a)}`,
      `${cost(b)} → ${cost(a)}`,
    ];
  };
  const fixedHere = [...fixById.keys()].filter(
    (id) => beforeById.has(id) || afterById.has(id)
  );
  const sliceTable = table(
    [
      "Slice",
      "Cases",
      "Pass rate before",
      "Pass rate after",
      "Mean tool calls",
      "Cost",
    ],
    [
      ...slices.map((s) => sliceRow(s, s)),
      sliceRow("**total**"),
      ...(fixedHere.length
        ? [
            sliceRow("**total, without dataset-fix rows**", undefined, [
              unfixed(before),
              unfixed(after),
            ]),
          ]
        : []),
    ]
  );
  const readmeBlock = fixedHere.length
    ? `${sliceTable}\n\n${fixedHere.length} ${fixedHere.length === 1 ? "row" : "rows"} changed what ${fixedHere.length === 1 ? "it expects" : "they expect"} between the runs (dataset fixes, not agent changes): ${fixedHere.sort().join(", ")}. The last total leaves them out.`
    : sliceTable;

  const classes = [...CLASSES, "unclassified" as const].filter((k) =>
    [...all(before), ...all(after)].some((c) => c.class === k)
  );
  const byClass = table(
    ["Class", "Cases", "Pass rate before", "Pass rate after"],
    classes.map((k) => {
      const b = all(before).filter((c) => c.class === k);
      const a = all(after).filter((c) => c.class === k);
      return [
        k,
        String(new Set([...ids(b), ...ids(a)]).size),
        passRate(b),
        passRate(a),
      ];
    })
  );

  const tags = [
    ...new Set([...all(before), ...all(after)].flatMap((c) => c.tags)),
  ].sort();
  const byTag = table(
    ["Tag", "Cases", "Pass rate before", "Pass rate after"],
    tags.map((t) => {
      const b = all(before).filter((c) => c.tags.includes(t));
      const a = all(after).filter((c) => c.tags.includes(t));
      return [
        t,
        String(new Set([...ids(b), ...ids(a)]).size),
        passRate(b),
        passRate(a),
      ];
    })
  );

  const scoreRows: string[][] = [];
  for (const slice of slices) {
    const b = cases(before, slice);
    const a = cases(after, slice);
    const keys = [
      ...new Set([...b, ...a].flatMap((c) => Object.keys(c.scores))),
    ].sort();
    for (const key of keys) {
      const m = (list: CaseReport[]) =>
        fixed(
          mean(list.flatMap((c) => (key in c.scores ? [c.scores[key]!] : []))),
          2
        );
      scoreRows.push([slice, key, m(b), m(a)]);
    }
  }

  const allIds = [
    ...new Set([...beforeById.keys(), ...afterById.keys()]),
  ].sort();
  const marked = (id: string) => (fixById.has(id) ? `${id} (dataset fix)` : id);
  const gateRows = allIds
    .map((id) => [
      marked(id),
      failedGates(beforeById.get(id)),
      failedGates(afterById.get(id)),
    ])
    .filter(([, b, a]) => b !== "none" || a !== "none");
  const verdict = (c: CaseReport | undefined) => c?.verdict ?? "(not run)";
  const verdictRows = allIds
    .filter((id) => verdict(beforeById.get(id)) !== verdict(afterById.get(id)))
    .map((id) => [
      id,
      verdict(beforeById.get(id)),
      verdict(afterById.get(id)),
      fixById.get(id)?.commit ?? "",
    ]);
  const fixRows = fixedHere.map((id) => {
    const f = fixById.get(id)!;
    return [
      id,
      f.commit,
      f.change,
      verdict(beforeById.get(id)),
      verdict(afterById.get(id)),
    ];
  });

  const markdown = [
    `# Before and after: \`${before.label}\` → \`${after.label}\``,
    "",
    `Generated by \`scripts/eval-diff.ts ${before.label} ${after.label}\` from \`docs/evals/runs/\`; do not edit by hand. Cases join by eval id. A case passes when its verdict is \`passed\` (every gate held and every soft threshold met); skipped cases are not counted. Cost is the agent's token cost as eve reports it, judge calls excluded.`,
    "",
    "## By slice",
    "",
    readmeBlock,
    "",
    "## By class",
    "",
    byClass,
    "",
    "## By tag",
    "",
    "A case carries several tags, so a case counts once in every tag it has.",
    "",
    byTag,
    "",
    "## Labelled scores (mean)",
    "",
    scoreRows.length
      ? table(["Slice", "Score", "Before", "After"], scoreRows)
      : "No labelled scores.",
    "",
    ...(fixRows.length
      ? [
          "## Rows whose expectation changed (dataset fixes)",
          "",
          "These rows were corrected between the runs: they expect something different in the after run, so a verdict change here says nothing about Clerk.",
          "",
          table(
            ["Case", "Commit", "Change", "Verdict before", "Verdict after"],
            fixRows
          ),
          "",
        ]
      : []),
    "## Verdict changes per case",
    "",
    verdictRows.length
      ? table(["Case", "Before", "After", "Dataset fix"], verdictRows)
      : "No verdict changed.",
    "",
    "## Failed gates per case",
    "",
    gateRows.length
      ? table(["Case", "Before", "After"], gateRows)
      : "No failed gates.",
    "",
  ].join("\n");

  return { markdown, readmeBlock };
}

/**
 * Replace the text between a block's markers (the default eval-diff pair, or
 * the named `eval-diff:<name>` pair); throws if the pair is missing.
 */
export function rewriteReadmeBlock(
  readme: string,
  block: string,
  name?: string
): string {
  const { start: START, end: END } = markers(name);
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start)
    throw new Error(`README has no ${START} ... ${END} block`);
  return `${readme.slice(0, start + START.length)}\n${block}\n${readme.slice(end)}`;
}
