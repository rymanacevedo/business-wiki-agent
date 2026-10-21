/**
 * The Ingest slice's deterministic checks, derived from the Manifest:
 * `checkIngest(entry, { before, after })` compares the seeded Wiki with the
 * Wiki after one Ingest of `entry` and returns the gates and the
 * `extraction` score. Wikis are `path -> Page` maps (see `readWikiDir`).
 */
export { checkIngest, type Check, type IngestResult } from "./lib/check";
export type { Wiki } from "./lib/pages";
