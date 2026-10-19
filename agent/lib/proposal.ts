import {
  applyEdits,
  pageField,
  pageSources,
  paymentStatus,
  validatePage,
} from "../../packages/page-edits";
import type { WikiStore } from "../../packages/wiki-store";
import { pagePath } from "./pages";

export type Change = { page: string; old_value: string; new_value: string };

export type Applied = Map<
  string,
  { etag: string; before: string; next: string }
>;

/**
 * Apply every change in memory, in order, without writing. Throws when a Page
 * is missing or an old value is not on it, so nothing is written by halves.
 */
export async function applyChanges(
  store: WikiStore,
  changes: Change[]
): Promise<Applied> {
  const applied: Applied = new Map();
  for (const { page, old_value, new_value } of changes) {
    const path = pagePath(page);
    let entry = applied.get(path);
    if (!entry) {
      const current = await store.read(path);
      if (!current) throw new Error(`No Page at ${path}.`);
      entry = { etag: current.etag, before: current.body, next: current.body };
    }
    const next: string = applyEdits(entry.next, [
      { find: old_value, replace: new_value },
    ]);
    applied.set(path, { ...entry, next });
  }
  for (const [path, { before, next }] of applied)
    if (isValid(path, before)) validatePage(path, next);
  return applied;
}

/** Hold a change to the Schema's rules only when the Page already met them. */
function isValid(path: string, page: string): boolean {
  try {
    validatePage(path, page);
    return true;
  } catch {
    return false;
  }
}

/**
 * Problems with a proposal, found before the Owner is asked: changes that
 * cannot apply, and a Record marked paid without closing its active payment
 * Obligation in the same call (the Schema: one Approval covers both).
 */
export async function proposalProblems(
  store: WikiStore,
  changes: Change[]
): Promise<string[]> {
  let applied: Applied;
  try {
    applied = await applyChanges(store, changes);
  } catch (error) {
    return [(error as Error).message];
  }
  const problems: string[] = [];
  for (const [path, { before, next }] of applied) {
    if (paymentStatus(before) === "paid" || paymentStatus(next) !== "paid")
      continue;
    const recordSources = pageSources(before);
    for (const obligation of await store.list("obligations/")) {
      const page = await store.read(obligation);
      if (!page || pageField(page.body, "status") !== "active") continue;
      // Its payment Obligation links the Record, or is an `other` Obligation
      // citing the same invoice.
      const cites =
        pageField(page.body, "obligation") === "other" &&
        pageSources(page.body).some((id) => recordSources.includes(id));
      if (!page.body.includes(path) && !cites) continue;
      const after = applied.get(obligation)?.next;
      if (!after || pageField(after, "status") !== "done")
        problems.push(
          `${path} is marked paid, but its payment Obligation ${obligation} stays active. Add a change to the same change_fact call setting it to status: done with done_on (and its - **Status**: line).`
        );
    }
  }
  return problems;
}
