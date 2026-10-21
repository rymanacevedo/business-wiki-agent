import assert from "node:assert/strict";
import { test } from "node:test";
import { calibrationReport, type OwnerLabel } from "../calibration";

const label = (
  n: number,
  faithful: boolean | null,
  cited: boolean | null
): OwnerLabel => ({
  evalId: `query/questions/${String(n).padStart(4, "0")}`,
  caseId: `case-${n}`,
  faithful,
  cited,
});

const scored = (
  n: number,
  scores: Record<string, number>
): { id: string; scores: Record<string, number> } => ({
  id: `query/questions/${String(n).padStart(4, "0")}`,
  scores,
});

test("with no Owner labels the page says the judge is uncalibrated, lists each row's judge scores, and keeps the threshold", () => {
  const report = calibrationReport({
    run: "before",
    labels: [label(0, null, null), label(7, null, null)],
    judged: [
      scored(0, { faithful: 1, cited: 1 }),
      scored(7, { faithful: 0.5 }),
    ],
    currentThreshold: 0.7,
  });

  assert.equal(report.form, "uncalibrated");
  assert.equal(report.thresholds, null);
  assert.match(report.markdown, /judge is uncalibrated/i);
  assert.match(report.markdown, /0 of 4 judgments labelled/);
  assert.match(
    report.markdown,
    /\| case-0 \| query\/questions\/0000 \| 1\.00 \| — \| 1\.00 \| — \|/
  );
  assert.match(
    report.markdown,
    /\| case-7 \| query\/questions\/0007 \| 0\.50 \| — \| n\/a \| — \|/
  );
});

// Worked by hand, judge "pass" = score >= 0.5:
// faithful pairs (judge, Owner): (+,+) (+,+) (+,-) (-,-): agreement 3/4;
//   p_judge 3/4, p_owner 2/4, chance 0.5, kappa (0.75 - 0.5) / 0.5 = 0.50.
// cited pairs: (+,+) (+,-) (+,+) (row 2 has no cited score): agreement 2/3;
//   p_judge 1, p_owner 2/3, chance 2/3, kappa 0.
// pooled: 5/7 agree, chance 27/49, kappa (35 - 27) / (49 - 27) = 0.36.
const worked = {
  run: "before",
  labels: [
    label(0, true, true),
    label(1, true, false),
    label(2, false, true),
    label(3, false, true),
  ],
  judged: [
    scored(0, { faithful: 1, cited: 1 }),
    scored(1, { faithful: 1, cited: 1 }),
    scored(2, { faithful: 0.5 }),
    scored(3, { faithful: 0, cited: 1 }),
  ],
  currentThreshold: 0.7,
};

test("every judgment labelled: percent agreement and Cohen's kappa at the 0.5 cut, per judge and pooled", () => {
  const report = calibrationReport(worked);

  assert.equal(report.form, "calibrated");
  assert.doesNotMatch(report.markdown, /uncalibrated/i);
  assert.match(report.markdown, /\| faithful \| 4 \| 75% \| 0\.50 \|/);
  assert.match(report.markdown, /\| cited \| 3 \| 67% \| 0\.00 \|/);
  assert.match(report.markdown, /\| pooled \| 7 \| 71% \| 0\.36 \|/);
  assert.match(
    report.markdown,
    /\| case-2 \| query\/questions\/0002 \| 0\.50 \| no \| n\/a \| yes \|/
  );
});

// faithful (1, yes) (0.5, yes) (0.5, yes) (0, no): any cut up to 0.5 agrees
//   4/4 (kappa 1); above 0.5 only 2/4 agree, p_judge 1/4, p_owner 3/4,
//   chance 6/16, kappa (0.5 - 0.375) / 0.625 = 0.20.
// cited (1, yes) x3 (0, no): every cut agrees 4/4, so it stays at 0.7.
test("the sweep reports each cut and picks the best-kappa cut per judge, nearest the current threshold on a tie", () => {
  const report = calibrationReport({
    run: "before",
    labels: [
      label(0, true, true),
      label(1, true, true),
      label(2, true, true),
      label(3, false, false),
    ],
    judged: [
      scored(0, { faithful: 1, cited: 1 }),
      scored(1, { faithful: 0.5, cited: 1 }),
      scored(2, { faithful: 0.5, cited: 1 }),
      scored(3, { faithful: 0, cited: 0 }),
    ],
    currentThreshold: 0.7,
  });

  assert.deepEqual(report.thresholds, { faithful: 0.5, cited: 0.7 });
  assert.match(
    report.markdown,
    /\| 0\.50 \| 100% \| 1\.00 \| 100% \| 1\.00 \|/
  );
  assert.match(report.markdown, /\| 0\.70 \| 50% \| 0\.20 \| 100% \| 1\.00 \|/);
  assert.match(report.markdown, /faithful.*\.atLeast\(0\.5\)/);
  assert.match(report.markdown, /cited.*\.atLeast\(0\.7\)/);
});

test("partly labelled: the agreement is shown on what is labelled, but no threshold is chosen", () => {
  const report = calibrationReport({
    ...worked,
    labels: [...worked.labels.slice(0, 3), label(3, null, null)],
  });
  assert.equal(report.form, "partial");
  assert.equal(report.thresholds, null);
  assert.match(report.markdown, /6 of 8 judgments labelled/);
  assert.match(report.markdown, /unchanged/);
});
