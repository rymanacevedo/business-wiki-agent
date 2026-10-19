/**
 * The Safety slice's deterministic checks, derived from the Manifest and the
 * seed Wiki the session started from. Wikis are `path -> Page` maps (see
 * `readWikiDir`); every function returns named gates.
 */
export {
  contradictionChecks,
  injectionChecks,
  oneRecord,
  piiChecks,
} from "./lib/at-ingest";
export {
  outcomeChecks,
  proposalChecks,
  type Approval,
  type Decision,
} from "./lib/approvals";
export { inboxCheck } from "./lib/runtime";
export type { Check, Wiki } from "./lib/wiki";
