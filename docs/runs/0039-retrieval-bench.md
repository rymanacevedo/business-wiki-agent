# 0039: Retrieval bench (ordering, Match floor, kind prior by MRR)

- **When**: 2026-10-23
- **Agent**: Claude Code (Claude Opus 5.5), implementer subagent
- **Driving**: [Retrieval bench: ordering, Match floor and kind prior by MRR](https://github.com/rymanacevedo/business-wiki-agent/issues/60), spec [#53](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

## Goal

Merge #57 (Links, Neighbourhood) into #58 (embeddings), since the bench needs both. Then decide the three knobs by measurement, using the pre-registered rule.

## What happened

- **Merge of #57 into #58.**
  - There was one conflict, in `packages/wiki-retrieval/index.ts` `search`. The hop now runs on the fused Matches.
  - #57's Link table was instance state, updated in place and read after the embedding await. It now hands out an immutable `LinkView` per Snapshot. The view is held next to that Snapshot's lexical index. Each Page's Links are still read once per etag.
  - Result: a search's hits, metadata and Links all come from one revision.
  - Two tests cover this. In one, the embed pauses while a newer search refreshes, and each search hops over its own revision's Links. In the other, a lexical-only search at a newer revision is followed by a hop.
- **Kind prior.** Added the `kindPrior` factory option (default off). When on, Matches are stably re-sorted by kind (profile, obligation, summary, entity, ledger) after the floor and the cap, with fused rank as the tie-break.
  - The decisions never defined a prior on Matches. The prototype's evidence was entity hubs outranking the invoice, and this is the plain reading of that.
  - The prior list moved to `lib/kinds.ts`, which it shares with the Neighbourhood tie-break.
- **The bench.**
  - `scripts/retrieval-bench.ts` is run as `bun run bench:retrieval [--lexical]`. Its logic is in `scripts/lib/retrieval-bench.ts`, tested on a tiny Wiki.
  - Query vectors come from the Gateway and are memoised per run. A degraded search fails the bench rather than scoring keyword-only.
  - The weighted alternative uses the prototype's floor of 0.2.
  - The output is formatted with prettier, so a rerun diffs clean.
- **Result** (`docs/evals/retrieval-bench.md`): 14 rows, hybrid, hop on.

  | Configuration          | MRR                            |
  | ---------------------- | ------------------------------ |
  | Defaults               | 0.470                          |
  | Weighted reach         | 0.470 (identical on every row) |
  | Match floor 0          | 0.470 (identical)              |
  | Kind prior on          | 0.449                          |
  | Lexical-only reference | 0.425                          |

  No knob strictly improves, so the defaults stand: count rule, floor a third, no prior. They were already the module's defaults. A comment on `matchFloor` points at the table.

## Findings worth remembering

- **The floor axis is inert under hybrid**, as #58 predicted. RRF scores over two top-20 lists never fall under a third of the top score.
- **Weighted reach changes no rank.** Under hybrid, every row that scores has all its expected Pages as Matches, so the Neighbourhood ordering never decides a rank on this dataset. Its only visible effect: `query-suite-number` loses the hop that reached the lease (the row still misses its insurance-certificate entry).
- **The kind prior helps and hurts.** It lifts `profile.md` rows (EIN, entity type: rank 3 to 1). It sinks the supplies Ledger (1 to 5) and the lease rows.
- **Two rows miss under hybrid:**
  - `query-licenses-permits` misses in every configuration.
  - `query-suite-number` misses under hybrid but is found lexical-only at rank 4. Fusion displaces it.
- **The semantic rows are found only with embeddings.** Lexical-only misses both diagnostic-kit and van-repair.

## Review rounds

1. On 8016786: exit 1. Standards had 0 findings; Spec had 2 blockers.
   - Source ids matched any path containing the id (an entity Page, or a longer id). They now resolve to `summaries/<id>.md` exactly.
   - Cells collapsed the Rungs and hid them when an entry was missing. Each cell now lists every `cites` entry's Rung in order, with `missing` where one is absent.

   Both were fixed test-first and the table regenerated. MRRs are unchanged.

## What the human checked

Nothing yet. The PR is a draft.

## Open questions

- Whether the kind-prior definition (a full re-sort by kind) is what the decision intended. A softer prior was not pre-registered, so it was not tried.

## Artifacts

- Branch `ticket/60-retrieval-bench`. The merge commit is cb51d1d, and the bench is d65951e.
- `docs/evals/retrieval-bench.md`.
