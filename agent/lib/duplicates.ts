import { expenseFields } from "../../packages/page-edits";
import type { WikiStore } from "../../packages/wiki-store";
import { SUMMARIES } from "./config";

const KEY = ["vendor", "date", "amount", "document"];

/**
 * Throws when writing `next` at `path` would add a Record that duplicates an
 * existing one: same vendor, date, amount, and (non-null) document number.
 * Editing a Page that already was a Record is left alone.
 */
export async function refuseDuplicateRecord(
  store: WikiStore,
  path: string,
  before: string | null,
  next: string
): Promise<void> {
  const fields = expenseFields(next);
  if (!fields || (before && expenseFields(before))) return;
  if (!fields.document || fields.document === "null") return;
  for (const other of await store.list(SUMMARIES)) {
    if (other === path) continue;
    const page = await store.read(other);
    const existing = page && expenseFields(page.body);
    if (existing && KEY.every((key) => existing[key] === fields[key]))
      throw new Error(
        `${other} already records ${fields.vendor} document ${fields.document} (${fields.date}, ${fields.amount}): this Source is a duplicate and adds no Record. Write its summary without an expense block, list it under that Record's "## Also seen in" with note_also_seen_in, and add no Ledger row.`
      );
  }
}
