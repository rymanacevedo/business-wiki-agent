import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Manifest } from "../../packages/corpus";

export type BuiltFixture = "full" | "base";

/**
 * The Sources the Ingest Traps collide with: the lease and the original
 * insurance certificate (suite Contradiction, Supersession), the first copy
 * of the duplicate receipt, and invoice 4471 (its PAID duplicate).
 */
const BASE = [
  "2025-04-01-lease-harborview",
  "2025-11-15-insurance-cert-meridian",
  "2026-09-09-receipt-valley-electric",
  "2026-09-12-invoice-cascade-parts-4471",
];

/** The Source ids Clerk Ingests to build a fixture, in Source-id order. */
export function buildPlan(manifest: Manifest, fixture: BuiltFixture): string[] {
  const ids = manifest.sources
    .filter((source) => !source.inbox)
    .map((source) => source.id)
    .sort();
  if (fixture === "full") return ids;
  for (const id of BASE)
    if (!ids.includes(id))
      throw new Error(`base Source ${id} is not a non-Inbox Corpus Source`);
  return ids.filter((id) => BASE.includes(id));
}

/**
 * Removes every Source not in `plan` from a build namespace's `sources/`
 * directory and returns their ids: Clerk sees only the Sources it is meant to
 * Ingest (in one build it opened an Inbox Source from list_sources).
 */
export async function holdBackSources(
  sourcesDir: string,
  plan: readonly string[]
): Promise<string[]> {
  const held: string[] = [];
  for (const file of (await readdir(sourcesDir)).sort()) {
    const id = file.replace(/\.[^.]+$/, "");
    if (plan.includes(id)) continue;
    await rm(join(sourcesDir, file));
    held.push(id);
  }
  return held;
}
