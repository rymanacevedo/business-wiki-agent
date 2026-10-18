import {
  EXPENSE_CATEGORIES,
  OBLIGATION_KINDS,
  PAYMENT_STATUSES,
  SOURCE_KINDS,
  TRAPS,
  type Manifest,
  type ManifestEntry,
} from "./types";

const ID = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when `value` is a real `YYYY-MM-DD` calendar date. */
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const cents = (n: number): number => Math.round(n * 100);

function datesOf(s: ManifestEntry): string[] {
  const dates = [s.date, ...s.obligations.map((o) => o.due)];
  if (s.payment?.due) dates.push(s.payment.due);
  return dates;
}

/** Every internal-consistency problem in a Manifest, given the Source file names on disk. */
export function validateManifest(
  manifest: Manifest,
  sourceFiles: string[]
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of manifest.sources) {
    if (seen.has(s.id)) problems.push(`duplicate id ${s.id}`);
    seen.add(s.id);
  }

  const files = new Set(sourceFiles);
  const listed = new Set(manifest.sources.map((s) => s.file));
  for (const s of manifest.sources) {
    if (s.file !== `${s.id}.md` && s.file !== `${s.id}.txt`) {
      problems.push(`file ${s.file} does not match id ${s.id}`);
    }
    if (!files.has(s.file)) problems.push(`no file for ${s.id}`);
  }
  for (const f of sourceFiles) {
    if (!listed.has(f)) problems.push(`no entry for ${f}`);
  }

  for (const s of manifest.sources) {
    const match = ID.exec(s.id);
    if (!match) problems.push(`bad id ${s.id}`);
    else if (match[1] !== s.date)
      problems.push(`id ${s.id} is not dated ${s.date}`);

    for (const d of datesOf(s)) {
      if (!isDate(d)) problems.push(`${s.id}: bad date ${d}`);
    }

    if (s.amount !== null && s.allocations.length > 0) {
      const sum = s.allocations.reduce((acc, a) => acc + cents(a.amount), 0);
      if (sum !== cents(s.amount)) {
        problems.push(
          `${s.id}: allocations sum to ${sum / 100}, amount is ${s.amount}`
        );
      }
    }
    if (s.amount !== null && s.allocations.length === 0) {
      problems.push(`${s.id}: amount without allocations`);
    }
    if (s.amount !== null && s.payment === null)
      problems.push(`${s.id}: amount without payment`);
    if (s.amount === null && s.allocations.length > 0) {
      problems.push(`${s.id}: allocations without amount`);
    }
    if (s.amount === null && s.payment !== null)
      problems.push(`${s.id}: payment without amount`);

    problems.push(...closedListProblems(s));
  }

  problems.push(...trapProblems(manifest), ...inboxProblems(manifest));
  problems.push(...referenceProblems(manifest));
  return problems;
}

function oneOf<T extends string>(list: readonly T[], value: string): boolean {
  return (list as readonly string[]).includes(value);
}

function closedListProblems(s: ManifestEntry): string[] {
  const problems: string[] = [];
  if (!oneOf(SOURCE_KINDS, s.kind))
    problems.push(`${s.id}: unknown kind ${s.kind}`);
  for (const a of s.allocations) {
    if (!oneOf(EXPENSE_CATEGORIES, a.category)) {
      problems.push(`${s.id}: unknown category ${a.category}`);
    }
  }
  if (s.payment && !oneOf(PAYMENT_STATUSES, s.payment.status)) {
    problems.push(`${s.id}: unknown payment status ${s.payment.status}`);
  }
  for (const o of s.obligations) {
    if (!oneOf(OBLIGATION_KINDS, o.kind))
      problems.push(`${s.id}: unknown obligation kind ${o.kind}`);
  }
  if (s.trap !== null && !oneOf(TRAPS, s.trap))
    problems.push(`${s.id}: unknown trap ${s.trap}`);
  return problems;
}

function trapProblems(manifest: Manifest): string[] {
  const problems: string[] = [];
  for (const trap of TRAPS) {
    const count = manifest.sources.filter((s) => s.trap === trap).length;
    if (count !== 1) problems.push(`trap ${trap} appears ${count} times`);
  }
  return problems;
}

function inboxProblems(manifest: Manifest): string[] {
  const inbox = manifest.sources.filter((s) => s.inbox);
  if (inbox.length !== 3)
    return [`inbox has ${inbox.length} sources, expected 3`];
  const problems: string[] = [];
  if (!inbox.some((s) => s.trap === "supersession")) {
    problems.push("inbox needs the supersession trap");
  }
  if (!inbox.some((s) => s.trap === "paid-duplicate")) {
    problems.push("inbox needs the paid-duplicate");
  }
  if (!inbox.some((s) => s.trap === null && s.kind === "receipt")) {
    problems.push("inbox needs one plain receipt");
  }
  return problems;
}

function referenceProblems(manifest: Manifest): string[] {
  const problems: string[] = [];
  const byId = new Map(manifest.sources.map((s) => [s.id, s]));
  for (const s of manifest.sources) {
    if (s.duplicateOf !== null && !byId.has(s.duplicateOf)) {
      problems.push(`${s.id}: duplicateOf unknown source ${s.duplicateOf}`);
    }
    for (const id of s.corroborates) {
      const record = byId.get(id);
      if (!record) {
        problems.push(`${s.id}: corroborates unknown source ${id}`);
        continue;
      }
      if (record.payment?.status !== "paid") {
        problems.push(`${s.id}: corroborates ${id}, which is not paid`);
      }
      if (record.date.slice(0, 7) !== s.date.slice(0, 7)) {
        problems.push(`${s.id}: corroborates ${id} from another month`);
      }
    }
  }
  return problems;
}
