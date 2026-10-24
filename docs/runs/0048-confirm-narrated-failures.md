# 0048: Confirm the narrated failures against their traces

- **When**: 2026-10-24
- **Agent**: Claude Code, Opus 5.5
- **Driving**: [Task: confirm the narrated failures against their traces](https://github.com/rymanacevedo/business-wiki-agent/issues/78), on the map [the submission README, led by What to Send Us](https://github.com/rymanacevedo/business-wiki-agent/issues/76)

## Goal

Work the next frontier ticket on the submission-README map. The frontier was empty, because this task held a claim and everything else waited on it. The Owner said the claim was stale and asked the agent to take it over.

## What happened

- The ticket was written for the Owner to open each trace in LangSmith. The agent read them through the LangSmith REST API instead, with `LANGSMITH_API_KEY` from `.env.local`. It pulled each trace's tool calls, errors and final reply, then checked gate counts and judge scores against the committed `docs/evals/runs/*/results/*.jsonl`.
- Checked Supersession deny, the Eastside judge disagreement, and "ingest everything new" (before and after for each), plus `query-dana-okafor` and `query-van-repair-bill` from the retrieval runs. Retrieval traces have no links in the docs, so they were found by `eval_run_label` and `eval_case_id` metadata.
- Every narration matched its trace. The van-repair trace exposed a defect nobody had recorded (below).
- The Owner accepted the recommendation:
  - Narrate Supersession deny and "ingest everything new" as drafted.
  - Reframe Eastside as "judge right, checks blind".
  - Make Dana Okafor a Known failures bullet.
  - File the fixture defect.
- Posted the findings and the resolution, closed the ticket, and filed [The full fixture's Eastside summary misstates the rotor line as 2 × 149.00](https://github.com/rymanacevedo/business-wiki-agent/issues/86) (`needs-triage`).
- Updated the map: added the decision line and removed the judge-disagreement fog item, because the reframe no longer depends on calibration labels.
- Left a retention note on [The recording script and the trace-link set](https://github.com/rymanacevedo/business-wiki-agent/issues/81), which is now the frontier.

## Findings worth remembering

- `fixtures/full` carries the baseline's rotor misreading ("2 × 149.00" where 149.00 is the line amount for two). In `retrieval-after` and `retrieval-after-hop`, Clerk answered "rotors $298.00", and the Query `faithful` judge gave it 0.99. That is correct by its rubric: the figure is on the Page. No check catches a wrong amount that comes from a fixture Clerk wrote. `fixtures/prototype` is clean, so `demo` is unaffected.
- The `before`/`after` traces date from 2026-10-19 and expire around 2026-11-02. The retrieval traces expire around 2026-11-06.
- The LangSmith API returns no `runs` key on transient errors, so retry. Use `/api/v1/runs/query` with `trace` set to the LangSmith trace id, not the OTel one.

## What the human checked

The Owner declared the earlier claim stale and approved the three narrations, the Eastside reframe, the Dana Okafor bullet and the bug filing. They did not open the traces themselves: the trace reading in this run is the agent's.

## Open questions

- Why the after-run Eastside Page still scored `page_faithful` 0. The adapter records no rationale.
- Whether to fix `fixtures/full` before submission (tracked on the new issue).

## Artifacts

- [Findings comment](https://github.com/rymanacevedo/business-wiki-agent/issues/78#issuecomment-6377446458)
- [Resolution comment](https://github.com/rymanacevedo/business-wiki-agent/issues/78#issuecomment-6377468089)
- [The full fixture's Eastside summary misstates the rotor line as 2 × 149.00](https://github.com/rymanacevedo/business-wiki-agent/issues/86)
- [Map](https://github.com/rymanacevedo/business-wiki-agent/issues/76)
