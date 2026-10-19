/**
 * The calibration template: one run's calibration-tagged Query rows as a
 * YAML the Owner fills with hand judgments (faithful, cited).
 */
export {
  calibrationYaml,
  type CalibrationInput,
  type CalibrationRow,
  type ResultLine,
} from "./lib/calibration";
/**
 * The calibration report: the Owner's filled template joined to the same
 * run's judge scores by eval id, as `docs/evals/calibration.md` plus the
 * thresholds to feed into the judges' `.atLeast` once every row is labelled.
 */
export {
  calibrationReport,
  JUDGES,
  type CalibrationReport,
  type CalibrationReportInput,
  type Judge,
  type JudgedCase,
  type OwnerLabel,
} from "./lib/calibration-report";
