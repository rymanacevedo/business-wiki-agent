/**
 * The before/after diff over two committed runs (`docs/evals/runs/<label>/`):
 * `readRun` loads one, `diffRuns` joins two by eval id into the
 * `before-after.md` page (by slice, class and tag) and the README table,
 * `rewriteReadmeBlock` swaps the table into the README between the default
 * eval-diff markers or a named `eval-diff:<name>` pair. Rows named as
 * dataset fixes are marked and left out of a second total.
 */
export {
  diffRuns,
  readRun,
  rewriteReadmeBlock,
  type DatasetFix,
  type Run,
} from "./lib/diff";
