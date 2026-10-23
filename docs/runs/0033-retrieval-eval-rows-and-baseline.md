# 0033: Retrieval eval rows, the baseline tag, and the retrieval-before run

- **When**: 2026-10-23
- **Agent**: Claude Code (Opus 5.5), implementer for one ticket under the spec #53 orchestrator
- **Driving**: [Eval rows for retrieval, the baseline tag, and the retrieval-before run](https://github.com/rymanacevedo/business-wiki-agent/issues/54), of [Spec: Retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/53)

## Goal

Freeze the retrieval measurement before any module code: eight Index-hostile Query rows, the `retrieval` tag schema, the git tag `eval-retrieval-baseline`, and the `retrieval-before` run against the old `search_wiki`.

## What happened

- Test first, at the two seams the ticket names: `loadQueryCases` (schema, row order, tags, judges) and `checkAnswer` (a worked correct and a worked wrong answer per new row, values from `fixtures/full`).
- The tag schema accepts `retrieval` and `retrieval:lexical|semantic|neighbourhood|absent`, and rejects any `retrieval:*` tag on a row without `retrieval`.
- The eight rows are the ticket's table verbatim, appended as rows 18 to 25 (`query/questions/0017` to `0024`). They carry no `trajectory` tag because the ticket lists their tags exactly; the standard trajectory still runs on them, since the eval keys it on `tools`, not the tag. Query eval, trajectory rule, judges, Page selection and Lint rows untouched.
- Commit 41c80d7 tagged `eval-retrieval-baseline` and pushed; no retrieval module code exists there.
- `retrieval-before` ran both invocations from 41c80d7, one after the other, with the documented flags. Base: 33 passed, 2 scored of 35. Full: 36 passed, 2 failed of 38.

## Findings worth remembering

Baseline per retrieval row (old substring `search_wiki`, Index first):

| #   | caseId                          | verdict                                                         | tools called                                    |
| --- | ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| 18  | query-cash-purchases            | passed                                                          | read_index, search_wiki, read_page, search_wiki |
| 19  | query-dana-okafor               | passed                                                          | read_index, search_wiki, read_page              |
| 20  | query-diagnostic-kit            | passed                                                          | read_index, search_wiki, read_page              |
| 21  | query-van-repair-bill           | **failed**: no payment-status word (unpaid / unconfirmed / ...) | read_index, read_page                           |
| 22  | query-ridgeline-bank-evidence   | passed                                                          | read_index, read_page                           |
| 23  | query-august-statement-confirms | passed                                                          | read_index, read_page                           |
| 24  | query-workers-comp              | passed                                                          | read_index, read_page, search_wiki              |
| 25  | query-cascade-late-fee          | passed                                                          | read_index, read_page                           |

- **7 of 8 retrieval rows already pass at the baseline.** The only failure is row 21, and it found the right Page (478.07, Eastside, cited) but did not say the payment is unconfirmed: an answer-content miss, not a retrieval miss. The README must say the rows mostly pass Index-only, so the measurement rests on the Rung metrics and on row 21, not on pass counts.
- The old substring `search_wiki` was called in 4 of the 8 rows; earlier committed runs never called it.
- The other failure, `safety-ingest-everything-new`, also failed in `before` and `after` (passed in `after-repairs`): a known flaky row, not caused by this ticket.
- Cost: $1.25 by the Gateway balance (16.43 to 15.18), about $0.91 by the reporter's per-case sum.

## What the human checked

Nothing yet; the PR is a draft for the orchestrator.

## Open questions

- The PR must be merged with a merge commit so the tagged commit lands on `main`; the per-ticket flow doc says squash.

## Artifacts

- Tag `eval-retrieval-baseline` = 41c80d7; run under `docs/evals/runs/retrieval-before/`.
- Branch `ticket/54-retrieval-eval-rows`, PR #65.
