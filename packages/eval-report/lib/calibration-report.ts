/** The judges the Owner labels on every calibration row. */
export const JUDGES = ["faithful", "cited"] as const;
export type Judge = (typeof JUDGES)[number];

/** One filled `calibration.yaml` entry: the Owner's hand judgment per judge. */
export type OwnerLabel = {
  evalId: string;
  caseId: string;
} & Record<Judge, boolean | null>;

/** A reporter case trimmed to what calibration reads: its eval id and judge scores. */
export type JudgedCase = { id: string; scores: Record<string, number> };

export type CalibrationReportInput = {
  /** The run label whose judge scores are calibrated (e.g. `before`). */
  run: string;
  labels: OwnerLabel[];
  judged: JudgedCase[];
  /** The judges' current `.atLeast` threshold. */
  currentThreshold: number;
};

export type CalibrationReport = {
  /** uncalibrated: no labels; partial: some labels; calibrated: every judgment labelled. */
  form: "uncalibrated" | "partial" | "calibrated";
  /** The threshold per judge to feed into `.atLeast`; null unless calibrated. */
  thresholds: Record<Judge, number> | null;
  markdown: string;
};

type Pair = { judge: Judge; score: number; owner: boolean };

/** Percent agreement and Cohen's kappa of "score >= cut" against the Owner. */
function agreement(pairs: Pair[], cut: number) {
  const n = pairs.length;
  if (n === 0) return { n, agreement: null, kappa: null };
  const pass = pairs.map((p) => p.score >= cut);
  const po = pairs.filter((p, i) => pass[i] === p.owner).length / n;
  const pj = pass.filter(Boolean).length / n;
  const pw = pairs.filter((p) => p.owner).length / n;
  const pe = pj * pw + (1 - pj) * (1 - pw);
  // Undefined when chance agreement is total: both sides constant and equal.
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe);
  return { n, agreement: po, kappa };
}

const score = (value: number | undefined) =>
  value === undefined ? "n/a" : value.toFixed(2);
const owner = (value: boolean | null) =>
  value === null ? "—" : value ? "yes" : "no";
const percent = (value: number | null) =>
  value === null ? "n/a" : `${Math.round(100 * value)}%`;
const twoDp = (value: number | null) =>
  value === null ? "n/a" : (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/**
 * Join the Owner's calibration labels to one run's judge scores by eval id
 * and write `docs/evals/calibration.md`: agreement, Cohen's kappa at the 0.5
 * cut, a threshold sweep, and the rows side by side.
 */
export function calibrationReport(
  input: CalibrationReportInput
): CalibrationReport {
  const byId = new Map(input.judged.map((c) => [c.id, c.scores]));
  const total = input.labels.length * JUDGES.length;
  const labelled = input.labels.reduce(
    (n, l) => n + JUDGES.filter((j) => l[j] !== null).length,
    0
  );
  const form: CalibrationReport["form"] =
    labelled === 0
      ? "uncalibrated"
      : labelled < total
        ? "partial"
        : "calibrated";

  const pairs: Pair[] = input.labels.flatMap((l) =>
    JUDGES.flatMap((judge) => {
      const s = byId.get(l.evalId)?.[judge];
      const o = l[judge];
      return s === undefined || o === null
        ? []
        : [{ judge, score: s, owner: o }];
    })
  );
  const groups: [string, Pair[]][] = [
    ...JUDGES.map((j): [string, Pair[]] => [
      j,
      pairs.filter((p) => p.judge === j),
    ]),
    ["pooled", pairs],
  ];
  const atCut = table(
    ["Judge", "Pairs", "Agreement", "Cohen's kappa (0.5 cut)"],
    groups.map(([name, list]) => {
      const a = agreement(list, 0.5);
      return [name, String(a.n), percent(a.agreement), twoDp(a.kappa)];
    })
  );

  const cuts = [
    ...new Set([
      ...Array.from({ length: 10 }, (_, i) => (i + 1) / 10),
      input.currentThreshold,
    ]),
  ].sort((a, b) => a - b);
  const sweep = table(
    ["Cut", ...JUDGES.flatMap((j) => [`${j} agreement`, `${j} kappa`])],
    cuts.map((cut) => [
      cut.toFixed(2),
      ...JUDGES.flatMap((j) => {
        const a = agreement(
          pairs.filter((p) => p.judge === j),
          cut
        );
        return [percent(a.agreement), twoDp(a.kappa)];
      }),
    ])
  );

  // Best kappa per judge, then best agreement, then nearest the current cut.
  const choose = (judge: Judge): number => {
    const list = pairs.filter((p) => p.judge === judge);
    const rank = (cut: number) => {
      const a = agreement(list, cut);
      return [
        a.kappa ?? -Infinity,
        a.agreement ?? -Infinity,
        -Math.abs(cut - input.currentThreshold),
      ];
    };
    return cuts.reduce((best, cut) => {
      const [r, b] = [rank(cut), rank(best)];
      const i = r.findIndex((v, k) => v !== b[k]);
      return i !== -1 && r[i]! > b[i]! ? cut : best;
    }, input.currentThreshold);
  };
  const thresholds =
    form === "calibrated"
      ? (Object.fromEntries(JUDGES.map((j) => [j, choose(j)])) as Record<
          Judge,
          number
        >)
      : null;
  const current = `.atLeast(${input.currentThreshold})`;
  const yaml = `docs/evals/runs/${input.run}/calibration.yaml`;
  const thresholdText = thresholds
    ? [
        "Chosen per judge: the cut with the highest Cohen's kappa against the Owner, then the highest agreement, then the one nearest the current threshold. Feed them into the judges' `.atLeast` in `evals/query/questions.eval.ts`:",
        "",
        ...JUDGES.map((j) => {
          const a = agreement(
            pairs.filter((p) => p.judge === j),
            thresholds[j]
          );
          return `- ${j}: \`.atLeast(${thresholds[j]})\` (was \`${current}\`): agreement ${percent(a.agreement)}, kappa ${twoDp(a.kappa)} over ${a.n} pairs.`;
        }),
      ]
    : [
        `No threshold is chosen until every judgment is labelled: the judges' \`${current}\` in \`evals/query/questions.eval.ts\` is unchanged.`,
      ];

  const rows = table(
    [
      "Case",
      "Eval id",
      "Judge faithful",
      "Owner faithful",
      "Judge cited",
      "Owner cited",
    ],
    input.labels.map((l) => {
      const s = byId.get(l.evalId) ?? {};
      return [
        l.caseId,
        l.evalId,
        score(s.faithful),
        owner(l.faithful),
        score(s.cited),
        owner(l.cited),
      ];
    })
  );

  const markdown = [
    "# Judge calibration",
    "",
    `Generated by \`bun run eval:calibration ${input.run}\`; do not edit by hand.`,
    "",
    form === "uncalibrated"
      ? `**The judge is uncalibrated.** ${labelled} of ${total} judgments labelled.`
      : `${labelled} of ${total} judgments labelled.`,
    "",
    ...(form === "uncalibrated"
      ? []
      : [
          "## Agreement at the 0.5 cut",
          "",
          atCut,
          "",
          "## Threshold sweep",
          "",
          sweep,
          "",
        ]),
    "## Thresholds",
    "",
    ...thresholdText,
    "",
    "## Method",
    "",
    `The Owner's hand labels in [\`${yaml}\`](runs/${input.run}/calibration.yaml) are joined by eval id to the judge scores of the \`${input.run}\` run's calibration-tagged Query rows (\`runs/${input.run}/query.json\`). A judge score counts as a pass when it is at least the cut. Agreement is the share of labelled pairs where judge and Owner agree; Cohen's kappa corrects it for chance (n/a when both sides are constant). A row with no score from a judge is left out of that judge's pairs. The judge's boolean score is the judge model's self-reported probability, not a token-level estimate.`,
    "",
    `To calibrate: set \`faithful\` and \`cited\` to \`true\` or \`false\` on every entry of \`${yaml}\`, run \`bun run eval:calibration ${input.run}\`, and copy the chosen thresholds into the judges' \`.atLeast\`.`,
    "",
    "## Rows side by side",
    "",
    rows,
    "",
  ].join("\n");
  return { form, thresholds, markdown };
}
