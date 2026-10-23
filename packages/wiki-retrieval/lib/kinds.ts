// The fixed kind prior (decision #46 item 9): profile, obligation, summary,
// entity, ledger; any other kind after them.

const KIND_PRIOR = ["profile", "obligation", "summary", "entity", "ledger"];

/** A kind's place in the prior: lower ranks first. */
export function kindRank(kind: string): number {
  const i = KIND_PRIOR.indexOf(kind);
  return i === -1 ? KIND_PRIOR.length : i;
}
