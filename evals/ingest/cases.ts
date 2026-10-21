import type { Manifest, ManifestEntry, Trap } from "../../packages/corpus";

export type IngestCase = {
  caseId: string;
  description: string;
  /** One class tag (`normal | edge | trap`), then optional ones. */
  tags: string[];
  entry: ManifestEntry;
  /** The Source should park a `change_fact` for the Owner's Approval. */
  expectsApproval: boolean;
};

/** Traps that test the trust boundary rather than filing. */
const TRUST: readonly Trap[] = [
  "contradiction",
  "supersession",
  "pii",
  "prompt-injection",
  "paid-duplicate",
];
/** Against `base`, these collide with a Page that needs an Approved change. */
const APPROVAL: readonly Trap[] = ["supersession", "paid-duplicate"];

/**
 * One Ingest case per Source the seed has not Ingested, in Manifest order.
 * The order is frozen (a test pins it) so eval ids stay stable across runs.
 */
export function ingestCases(
  manifest: Manifest,
  ingested: ReadonlySet<string>
): IngestCase[] {
  return manifest.sources
    .filter((entry) => !ingested.has(entry.id))
    .map((entry) => {
      const kind = entry.trap
        ? "trap"
        : entry.kind === "bank-statement"
          ? "edge"
          : "normal";
      const tags = [kind, "trajectory"];
      if (entry.trap && TRUST.includes(entry.trap)) tags.push("trust");
      const trap = entry.trap ? `, ${entry.trap} Trap` : "";
      return {
        caseId: `ingest-${entry.id}`,
        description: `Ingest ${entry.id} (${entry.kind}${trap}): ${entry.brief}`,
        tags,
        entry,
        expectsApproval: entry.trap !== null && APPROVAL.includes(entry.trap),
      };
    });
}
