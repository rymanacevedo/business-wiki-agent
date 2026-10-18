# 0014: Resolve the eval dataset and evaluator design ticket

- **When**: 2026-10-18
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Eval dataset and evaluator design](https://github.com/rymanacevedo/business-wiki-agent/issues/12)

## Goal

Work through the map: take the next frontier ticket and resolve it. The ticket asked what the eval dataset contains, what each case expects, which evaluator judges it, how the judge is calibrated, and how the before/after table is produced.

## What happened

1. Queried the frontier: the eval-design ticket was the only unblocked child; claimed it.
2. Gathered facts before asking: the brief, the harness research, the Schema prototype's frontmatter block, and the eval cases each of the trust, corpus, schema, and persistence resolutions had handed forward.
3. Round 1, twelve questions on structure: slice-by-directory with class tags, `base` seed contents, Manifest-derived Ingest checks, partial-credit `extraction` score, live tools without stubs, Query row shape (and Queries not writing to the Log), model-driven Lint kept for the baseline, Approval cases driven end to end, dropping cost-cap and immutability from the suite, judge model and soft-only posture with four rubrics, calibration against the baseline's actual outputs, before/after reporter and diff. All accepted.
4. Round 2, eight questions on content: safety split into `at-ingest` (base seed) and `approvals` plus `runtime` (full seed) after noticing the Contradiction, PII, and injection Ingests collide with Pages already in `full`; the 17 Query rows, 13 Safety rows, 5 Lint rows; per-Trap Ingest expectations; corroborating evidence for a paid Record as body text rather than a `change_fact`; citation form in answers and judge state composition; timeouts, concurrency, and the frozen Demo Date. All accepted.
5. Amended the glossary's Log entry (Queries leave no entry), posted the resolution, closed the ticket, appended the gist to the map, cleared two fog entries the resolution made specific (improve step, judge calibration), and left context comments on the submission-story ticket, the spec-synthesis task, and the schema prototype (payment-evidence amendment).

## Findings worth remembering

- Seed choice is per invocation, so any Safety case that Ingests a Source whose Page is already in `full` must run in the `base` invocation; directory prefixes select them (`safety/at-ingest`).
- Under the prototype's rule that the whole `expense.payment` block is Established, a bank statement corroborating five already-paid receipts would park on five Approvals. The fix is a rule, not a tool: corroboration is body text, only `unpaid`/`unknown` to `paid` needs Approval.
- There is no lint tool, so the baseline's Lint is LLM date arithmetic against the Demo Date; the eval asserts placement so a miss shows up as the first honest failure and the fix is left to triage.
- Judge handles are not awaitable and outputs change between runs, so calibration has to label a specific run's outputs after the fact and join on eval id.

## What the human checked

- Accepted all twenty recommendations across both rounds without changes.

## Open questions

- Whether `openai/gpt-6-luna-decisions` grades boolean rubrics well enough at the 0.7 cut; calibration after the baseline decides, with `typesafe-ai/jev` as the fallback.
- Whether two concurrent Ingests in one eval (the isolation row) behave under Eve's session model; the implementing agent should try it early and skip the row with a reason if it cannot.

## Artifacts

- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/12#issuecomment-6245871488
- Context comments on the submission-story ticket, the spec-synthesis task, and the schema prototype ticket.
- `GLOSSARY.md` (Log amended), this run file.
