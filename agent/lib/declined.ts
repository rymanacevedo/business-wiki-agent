import { pageField } from "../../packages/page-edits";
import type { WikiStore } from "../../packages/wiki-store";
import { pagePath } from "./pages";
import { declinedChanges, type ProposedChange } from "./sequence";

/** An Obligation a declined change_fact named as the new one (a Supersession's). */
export type DeclinedObligation = { kind?: string; due: string };

/** What the Owner declined this turn, in the terms the tools check. */
export type Declined = {
  changes: ProposedChange[];
  obligations: DeclinedObligation[];
};

export const NOTHING_DECLINED: Declined = { changes: [], obligations: [] };

const NEW_OBLIGATION = /obligations\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]*\.md/g;

/**
 * Read the turn's declined change_fact calls. A new Obligation named in one
 * (`superseded_by: obligations/<due>-<slug>.md`) takes its due date from its
 * path and its kind from the Obligation it would have superseded.
 */
export async function declinedThisTurn(
  store: WikiStore,
  messages: unknown
): Promise<Declined> {
  const changes = declinedChanges(messages);
  const obligations: DeclinedObligation[] = [];
  for (const change of changes) {
    const page = safePath(change.page);
    for (const [path, due] of change.new_value.matchAll(NEW_OBLIGATION)) {
      if (path === page) continue;
      const current = page ? await store.read(page) : null;
      const kind = current ? pageField(current.body, "obligation") : undefined;
      obligations.push(kind ? { kind, due } : { due });
    }
  }
  return { changes, obligations };
}

/** Changes the Owner declined on the Page at `path`. */
export function declinedOn(declined: Declined, path: string): ProposedChange[] {
  return declined.changes.filter((c) => safePath(c.page) === path);
}

/** The fact lines a declined change would have replaced on its Page. */
export function declinedLines(declined: Declined, path: string): string[] {
  const lines: string[] = [];
  for (const { old_value, new_value } of declinedOn(declined, path)) {
    const kept = new Set(new_value.split("\n").map((l) => l.trim()));
    for (const line of old_value.split("\n").map((l) => l.trim()))
      if (line && !kept.has(line)) lines.push(line);
  }
  return lines;
}

/** True when an Obligation of this kind and due date is one the Owner declined. */
export function isDeclinedObligation(
  declined: Declined,
  kind: string | null,
  due: string | null
): boolean {
  return declined.obligations.some(
    (o) => o.due === due && (o.kind === undefined || o.kind === kind)
  );
}

function safePath(path: string): string | null {
  try {
    return pagePath(path);
  } catch {
    return null;
  }
}
