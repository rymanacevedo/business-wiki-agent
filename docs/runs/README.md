# Run log

One file per agent session, so the human can retell the thought process behind every turn of the build and answer "how did the coding assistant help, and what did you check yourself" at the interview.

## When to write one

End every agent session by adding a run file, before reporting back. Codex and Claude Code sessions both count. A session that produced only a conversation still gets an entry: the decisions are the record.

## File

`docs/runs/NNNN-<slug>.md`, numbered from `0001` in the order the entries are **committed**, not the order the sessions started. Sessions run concurrently, so:

- Pick the number at the moment you write the file, not at session start: fetch `origin/main`, then take one higher than the highest number present in the working tree, the index, and `origin/main` combined (`git fetch -q && ls docs/runs/ && git ls-tree --name-only origin/main docs/runs/`).
- The entry that lands on `main` first keeps its number. If your entry is still uncommitted when another one with the same number appears, renumber yours before committing.
- Never rename, edit, or commit another session's uncommitted entry. If you find a collision you did not cause, mention it in your report and leave the file alone.

## Template

```markdown
# NNNN: <what this run was for>

- **When**: <date>
- **Agent**: <Claude Code / Codex, model if known>
- **Driving**: <ticket or map link, or "ad hoc: <request>">

## Goal

<one or two lines: what the human asked for>

## What happened

<the decisions made and work done, in order, each with the reason. Link tickets by title.>

## Findings worth remembering

<facts surfaced that later runs depend on; gotchas; things that surprised us>

## What the human checked

<what the human verified or decided themselves, versus accepted from the agent>

## Open questions

<what this run left undecided or unverified>

## Artifacts

<links: commits, branches, issues, files>
```

Write for a reader who did not see the session: name things by title, give the reason beside each decision, and keep it to one screen where possible. Facts already on the wayfinder map or in a ticket get a link, not a restatement.

## Index

One line per run entry: the decision, then the alternative, then the trade-off. Where an entry doesn't record one of the three, the line says so, and an entry that records too little to retell, or repeats another entry, is marked _Thin_ with the reason. Within a phase, lines follow the order the sessions ran. Numbers are as committed: 0010, 0027 and 0031 are missing, and 0029, 0030 and 0043 each name two files, so every line links its file by name. The index started from §1 of the notes for [Research: the decision and trade-off each run records](https://github.com/rymanacevedo/business-wiki-agent/issues/77) and rests only on the entries and ADRs linked here.

### Charting and specs (map #1)

- [0001 Chart the wayfinder map](0001-chart-the-map.md): build on Eve's native evals, with LangSmith for traces, one Gateway key, Claude Sonnet 5.5 as the agent and a judge from a different model family; the problem was redirected from support triage to a business wiki. Alternative: Braintrust as the trace fallback; support triage was the agent's first pitch. Trade-off: the entry records none (it is the opening grilling round).
- [0002 Resolve the scope ticket and land the research](0002-scope-ticket-and-research.md): one Owner persona; compliance means only dated Obligations plus categorized Expense Records; Approval is needed only to change an established fact; retrieval is Index-first with one keyword fallback and **no embeddings**. Alternative: the entry names none for scope; the judge was left open (`openai/gpt-6-luna-decisions` vs `typesafe-ai/jev`); Neon is the fallback if Blob's quota is short. Trade-off: the entry records none explicitly.
- [0006 Provision the dev environment and credentials](0006-provision-dev-environment.md): set the nvm default to Node 24 rather than reinstall; leave Vercel Blob out of the wizard; point LangSmith at the Owner's four per-environment projects. Alternative: one LangSmith project, asking the Owner to delete the extras. Trade-off: per-environment projects may not suit the Reviewer, which the entry leaves for the submission-story ticket.
- [0007 Resolve the seed corpus ticket](0007-seed-corpus-ticket.md): a generic single-owner repair shop generated from a parameterised Bible, with closed lists, eight Traps and text-only Sources. Alternative: a specific Colorado bakery with industry permits, rejected by the human as "far too specific"; PDFs and images through `read_file`. Trade-off: text-only is "the deliberate cut", because vision would need a custom path.
- [0009 Resolve the trust boundaries ticket](0009-trust-boundaries-ticket.md): Approval through distinct tools with declarative policies, and no delete tool; Masking at `read_source`; traces record inputs and outputs; a fixed "That isn't in the wiki" phrase. Alternative: the entry records none (all accepted). Trade-off: full traces are safe only because Masking happens before the model ("the two decisions are coupled"); the fixed phrase is "a deliberate crutch for a deterministic check".
- [0011 Resolve the wiki schema prototype ticket](0011-wiki-schema-prototype-ticket.md): variant A for six conventions; Contradictions show both claims equally (B, which overturned the agent's recommendation); an invoice's due date becomes an Obligation (the agent's call, flagged); `expense.payment` becomes an Established Fact. Alternative: the first recorded value wins a Contradiction; vendor+amount+date as proof of a duplicate. Trade-off: invoice Obligations may add too much Approval traffic to the demo.
- [0012 React to the Wiki schema prototype](0012-review-wiki-schema-prototype.md) (Codex): recommended A for six conventions and B for Contradictions, and found the gaps around duplicate matching, Allocations and payment evidence; two follow-up verifications. It was first numbered 0010 (its "Follow-up verification" says so). _Thin: a review, so it records no alternative or trade-off._
- [0013 Resolve the wiki persistence and deployment shape ticket](0013-wiki-persistence-ticket.md): a local directory plus private Blob (ADR 0001), local-only evals, one seed per `eve eval` invocation, a single agent, fixtures built by Clerk itself, Approval-needing Sources held back as the Inbox; the demo URL ships with **no auth** (the human overturned the agent). Alternative: a shared HTTP Basic credential; subagents. Trade-off: an open URL exposes Gateway credit, not data, and session cost caps bound it; slices run as separate invocations because tools can't see which case made a session.
- [0014 Resolve the eval dataset and evaluator design ticket](0014-eval-design-ticket.md): slices by directory; Ingest checks derived from the Manifest; live tools with no stubs; a soft-only judge with four rubrics; calibration against the baseline's outputs; model-driven Lint kept for the baseline. Alternative: `typesafe-ai/jev` as the judge fallback; cost-cap and immutability eval rows, dropped to unit tests. Trade-off: model-driven Lint is expected to be "the first honest failure"; calibration must label one specific run after the fact.
- [0015 Resolve the submission story ticket](0015-submission-story-ticket.md): the README carries the full story with a timed six-stop box; one Mermaid diagram; three narrated failures; a dedicated LangSmith evals project; share links made on submission day. Alternative: two LangSmith projects (the fallback). Trade-off: share links expire with the 14-day retention, so they are dated and made late.
- [0016 Synthesize the spec and implementation ticket graph](0016-spec-and-ticket-graph.md): spec #15 lives as an issue only, with 15 tracer-bullet tickets, two test seams, and a day plan with ordered scope cuts. Alternative: a copy under `docs/specs/`. Trade-off: the run was unattended, so the skills' seam check and breakdown review became stated assumptions.

### Build tooling and the review gate

- [0003 Repo tooling and package layout](0003-codex-repo-tooling.md) (Codex, reconstructed): husky plus lint-staged plus the full `bun run check` on every commit; deep-module `packages/`; `CLAUDE.md` symlinked to `AGENTS.md`. Alternative: the entry records none. Trade-off: docs-only commits pay for the full check. _Thin: reconstructed from a commit, and what the human checked is "Unknown"._
- [0004 Independent review of completed spec implementation](0004-cross-agent-review-design.md) (Codex): one final integration review by read-only Codex with two parallel axes, at most two automatic repairs, failing closed. Alternative: per-ticket and Git-hook reviews. Trade-off: tested only with fakes, not a paid Codex call; readiness is an agent policy, not a required remote check.
- [0005 Verify the independent spec review wrapper works](0005-verify-spec-review-wrapper.md): removed `--ephemeral` so Codex subagents can load their rollout. Alternative: the entry records none. Trade-off: review sessions now persist under `~/.codex`; the AC3 stale-review gap was left open.
- [0008 Install Zod](0008-install-zod.md) (Codex): added Zod 4.6.7 as a runtime dependency. _Thin: entry records no alternative or trade-off._
- [0017 Verify live adversarial review](0017-verify-live-adversarial-review.md) (Codex): started interim Standards and Spec reviewers on #16/#17, and found that draft PR #31's body broke the `pr` format. _Thin: it is a verification, so the entry records no decision or trade-off._
- [0018 Run the spec review at high reasoning effort with short errors](0018-spec-review-high-effort.md): `codex exec` runs with `model_reasoning_effort="high"`, and a failed run reports only its `ERROR:` lines. _Thin: entry records no alternative or trade-off._

### Spec #15 build

- [0019 README eval handoff](0019-readme-eval-handoff.md) (Codex): added the README's eval-diff markers, and said that boolean judge probabilities are reported by the model. Records a Live Ingest run: 24 passed, 2 failed, $0.53. _Thin: entry records no decision or trade-off beyond the doc edit._
- [0020 Commit the README handoff](0020-commit-readme-handoff.md) (Codex): treat the injection-summary zero as a _suspected_ judge disagreement, not a confirmed false negative. _Thin: entry records no alternative or trade-off._
- [0021 Implement spec #15 (Clerk) across tickets #16–#30](0021-implement-clerk-spec.md), build part: free-tier models (`openai/gpt-5-mini` for the agent, `mistral/mistral-medium-3.5` for the judge through a chat-judge adapter); for the 300K token cap, tools do more per call; Vercel upgraded to Pro; baseline 53/65 and after run 60/65. Alternative: Anthropic models and decision models (403 on the free tier); telling the model to batch its calls (didn't work). Trade-off: the free judge is saturated (53 of 56 baseline judgments were 1.0) and uncalibrated.

### Spec #15 review rounds (all from 0021)

- **Round 1** (5 blocking): repaired in five branches, each test-first. The human chose to fix "ingest everything new" and `fixtures/full` rather than list them. Alternative tried: a dynamic instruction, then a step-scoped dynamic tool (dropped because it broke the prompt cache); the note now goes in the `change_fact` result.
- **Round 2** (2): the Contradiction guard must keep the complete original claim, and Masking works by label, card grouping and Luhn.
- **Round 3** (1): spaced account and routing groups. Both automatic rounds were used up, so the human approved a third repair.
- **Round 4** (2): the human approved a _root-cause_ round, because "each round had found the next variant of a narrow fix"; facts are now held by section and label.
- **Round 5** (2): a structural round. Fact Pages accept plain Markdown only, and Masking is fail-safe (it masks every number of 8+ digits unless that number is positively known to be safe).
- **Round 6** (3, not repaired): the human shipped with the findings listed (#39, #40). Trade-off: PR #31 was marked ready on the human's decision, not on a passing review.

### Retrieval spec #53: charting (map #42)

- [0022 Architecture review, then chart the retrieval map](0022-review-and-chart-retrieval-map.md): retrieval was the top of eight candidates; the human redirected it to hybrid entry (keyword plus embedding, fused by RRF) plus expansion along the Wiki's own Links; no graph database, no extracted ontology; embeddings are the first scope cut. Alternative: lexical-first; the Index as a derived cache (second candidate). Trade-off: this revisits map #1's deliberate "no embeddings" choice because of the brief's RAG line.
- [0023 Decide the Link model and the retrieval interface](0023-link-model-and-retrieval-interface.md): four Link kinds, traversed both ways, with a one-hop budget and no "shares a Source" shortcut. Alternative: a "shares a Source" Link. Trade-off: density (a bank statement cited by six Records would make all six neighbours of each other); no ADR because the model is cheap to reverse.
- [0024 Prototype the retrieval result as the model sees it](0024-prototype-retrieval-result.md): rendering Variant A; the Neighbourhood hop is experimental, behind a switch, until the evals show a benefit. Alternative: two Neighbourhood orderings (by count or degree-weighted) and other renderings. Trade-off: on this fixture the hop rarely adds a needed Page; the two orderings pull in opposite directions.
- [0025 Review the retrieval prototype for maintainability](0025-review-retrieval-prototype.md) (Codex): keep production choices simple (explicit result tiers, Citations and complete excerpts, Page-level Links, the decided ordering) until comparative evals justify tuning. Alternative: the entry records none. Trade-off: the captured matrix doesn't establish answer relevance, and its token estimates are characters divided by four. _Thin: a review; the human recorded no decision in it._
- [0026 Decide the seam, its callers, and the degrade path](0026-seam-callers-and-degrade-path.md): a new package; lazy validation against an etag manifest; lazy delta embedding inside `search`; a hidden `cache/` prefix (ADR 0002); Lint moves to `list_flagged`; `neighbourhood` off by default. Alternative: embedding at write time (the charting note, refined here). Trade-off: no write tool changes, but the memo must live in the agent's config layer.
- [0051 Decide the eval story for retrieval](0051-eval-story-for-retrieval.md) (first numbered 0027): frame retrieval as a measurement, using eight Index-hostile rows, four labelled runs and pre-registered decision rules. Alternative: a promise that retrieval wins. Trade-off: no committed run had ever called `search_wiki`, so pass counts can't carry the story.
- [0028 Review the eval-story decision against acceptance criteria](0028-review-eval-story-ac.md) (Codex): no Standards findings; the semantic repair row breaks its own zero-term-overlap rule ("vehicle" and "service" are on the Eastside summary), so revise the row or relax the rule before the baseline. Alternative: relaxing the zero-overlap rule. Trade-off: the entry records none. _Thin: a review; the human had not accepted its finding._
- [0029 Synthesise the retrieval spec and implementation ticket graph](0029-retrieval-spec-and-ticket-graph.md): spec #53 plus ten tickets; the rows-and-baseline ticket blocks all module code. Alternative: running the rows ticket in parallel with the store ticket. Trade-off: a clean "baseline before code" history in exchange for a serial start; the run was unattended, so assumptions replaced the skills' pauses.
- [0029 Double-check the GitHub retrieval spec](0029-double-check-github-retrieval-spec.md) (Codex): the spec's testing paragraph conflicts with absent rows, MRR needs rules for alternative Citations and missing results, the query embedding is still a network call, and the vehicle/service row still overlaps. Alternative: the entry records none. Trade-off: aggregate pass counts can keep embeddings while single retrieval rows regress. _Thin: a review; the human had not responded to its findings._
- [0030 Reconcile the retrieval spec and tickets with a review](0030-reconcile-retrieval-spec-review.md): row 4 reworded to share no token with its answer; `list_flagged` made never-cut; a stricter embeddings rule (ties go to lexical-only, deciding rows rerun 2 of 3); the hop is measured after the embeddings rule. Alternative: the original row wording and rules. Trade-off: one sequencing dependency on a run's result, so the hop's evidence comes from the configuration that ships.
- [0030 Re-review the updated retrieval spec and tickets](0030-rereview-retrieval-spec.md) (Codex): two contract gaps remain (`flagged` must initialise and refresh the memo without a search; the hop must be measured with the embeddings setting that ships), and the bench needs a combined-configuration result. Alternative: the entry records none. Trade-off: knob improvements chosen one at a time can interact. _Thin: a review; the human had not accepted its findings._
- [0042 Review the retrieval prototype for maintainability](0042-review-retrieval-prototype.md) (Codex). _Thin: the same entry as 0025, landed again under the next free number; only the heading differs._
- [0043 Review the eval-story decision against acceptance criteria](0043-review-eval-story-ac.md) (Codex). _Thin: the same entry as 0028, landed again under the next free number; only the heading and one numbering note differ._
- [0044 Double-check the GitHub retrieval spec](0044-double-check-github-retrieval-spec.md) (Codex). _Thin: the same entry as 0029 "Double-check", landed again under the next free number; only the heading differs._
- [0045 Re-review the updated retrieval spec and tickets](0045-rereview-retrieval-spec.md) (Codex). _Thin: the same entry as 0030 "Re-review", landed again under the next free number; only the heading differs._

### Retrieval spec #53: build and review

- [0052 Vercel spend on spec #15, and one PR per ticket](0052-vercel-spend-and-per-ticket-prs.md) (first numbered 0031): one stacked draft PR per ticket with a per-PR Codex gate. Alternative: one integration PR (spec #15's flow). Trade-off: the entry records none (0053 records the cost afterwards). Records #15 spend: $13.57 of $15.
- [0032 Store manifest with etags and the hidden cache prefix](0032-store-manifest-and-cache-prefix.md): hide `cache/` in `namespacedStore`, not in `Backend.list`; strip Blob's weak `W/` etags. Alternative: hiding it in `Backend.list`. Trade-off: a forced reseed must still see the cache file; the entry left open whether earlier large-Page writes were conflicting.
- [0033 Retrieval eval rows, the baseline tag, and the retrieval-before run](0033-retrieval-eval-rows-and-baseline.md): tagged `eval-retrieval-baseline` before any module code; 7 of 8 retrieval rows already pass; the PR merges with a merge commit so the tag lands on `main`. Alternative: a squash merge, the flow doc's default. Trade-off: the measurement rests on Rung metrics, not on pass counts. Cost $1.25.
- [0034 wiki-retrieval package, lexical Matches behind search_wiki](0034-wiki-retrieval-lexical.md): BM25 lexical Matches; frontmatter parsed once as YAML instead of line by line; "one Page must never take retrieval down"; a bounded Markdown chunker. Alternative: a fix per YAML spelling; a 16,000-character parse cap (it lost late Links). Trade-off: six repair rounds and PR #67 still a draft with three findings.
- [0035 eval-diff --block and the By tag table](0035-eval-diff-block-and-by-tag.md): named README blocks; a named block reads its own `dataset-fixes.<name>.json`. Alternative: one shared dataset-fixes file (it misreported the retrieval diff). Trade-off: the script still rewrites `before-after.md` for any pair (fixed in 0041).
- [0036 Embeddings for retrieval](0036-embeddings-rung.md): `openai/text-embedding-3-small` at 512 dimensions; cache keyed by **content hash, not store etag**; RRF with k = 60; degrade only on `EmbedUnavailable`; immutable Snapshots. Alternative: keying the cache by store etag. Trade-off: the cache doesn't notice code changes (delete it and re-embed); under RRF no query ever gets zero Matches.
- [0037 list_flagged tool and the Lint skill's exhaustive flag scans](0037-list-flagged-and-lint-scans.md): one `READ_PAGE_MAX` shared by the tool and the skill; scaffolding Pages are kept on a separate shelf that only `flagged` sees. Alternative: `search_wiki` for scans (capped at five). Trade-off: the entry records none beyond the split.
- [0038 Links and the Neighbourhood behind the experimental switch](0038-links-and-neighbourhood.md): Links lexed with `marked` rather than a raw `](...)` scan; a Link table per Snapshot; the label "names party". Alternative: the raw scan. Trade-off: `marked` became a direct dependency; Clerk never called `search_wiki` on the Neighbourhood prompts.
- [0039 Retrieval bench](0039-retrieval-bench.md): no knob strictly improves MRR (defaults 0.470, kind prior 0.449, lexical-only 0.425), so the pre-registered defaults stand. Alternative: weighted reach, a floor of 0, the kind prior. Trade-off: the floor is inert under hybrid; the kind prior helps profile rows and hurts Ledger and lease rows.
- [0040 Query eval Rung metrics and the one instruction sentence](0040-query-rung-metrics.md): five soft metrics read from `turn.toolCalls`; `driveSegments` added; only the last prompt is scored; the fixtures' `SCHEMA.md` is left alone. Alternative: an `eventsSatisfy` fallback (not needed). Trade-off: changing `SCHEMA.md` would move the seeded fixtures.
- [0041 Retrieval after runs, the decision rules, and the README](0041-retrieval-after-runs-and-docs.md): the rules, applied as written, **cut embeddings** (the default is lexical-only, and `CLERK_RETRIEVAL_EMBEDDINGS=1` turns them back on) and keep the Neighbourhood off. Alternative: shipping hybrid. Trade-off: verdicts moved on answer wording, not on retrieval; Clerk searched in only 4–6 of 25 rows. Cost $2.27.
- [0053 Implement spec #53 across tickets #54–#63](0053-implement-retrieval-spec.md) (first numbered 0042): the first run of the per-ticket flow; #67 and #74 were marked ready on the human's decision with known blockers (#75). Alternative: a structural chunker that cuts where marked's own lexer reports a boundary (left open on #75). Trade-off: the stack collapsed downward, so PRs carried several tickets; the same one-variant-per-round pattern as spec #15. Spec #53's Gateway spend: $3.77 ($16.43 to $12.66).

### The submission README (map #76)

- [0043 Prototype the submission README skeleton](0043-readme-skeleton-prototype.md): the README becomes the submission at about 200 lines; content already under `docs/` is deleted, and the three blocks that exist nowhere else move there; the Owner chose A1 (the generated tables kept, folded), kept the small-limits line, and took cuts a, b, d and e. Alternative: dropping the generated blocks, which `eval:diff` needs (it exits 1 without its markers). Trade-off: the draft measured about 225 lines, so the cuts were listed by size for the Owner to choose rather than trimmed quietly.
- [0047 Prototype the submission README skeleton](0047-readme-skeleton-prototype.md). _Thin: the same session as 0043, landed again under the next free number; only the heading and its numbering note differ._
- [0046 Which decisions headline the README](0046-headline-decisions-grilling.md): a headline bullet carries only a decision the README states nowhere else; three bullets (Eve with the Wiki in an app-runtime store, fixtures built by Clerk itself, shipping with the review findings listed after changing defaults); a five-row model table with Embeddings reframed as keyword-only instead of hybrid; a cell no entry records says "not recorded"; Build's spend is cited only from committed entries. Alternative: the research's top-ranked candidates; the Owner supplying the missing Build and Review facts. Trade-off: the top three candidates don't headline, because the README already states them.
- [0048 Confirm the narrated failures against their traces](0048-confirm-narrated-failures.md): read the traces through the LangSmith REST API; narrate Supersession deny and "ingest everything new" as drafted; reframe Eastside as "judge right, checks blind"; make Dana Okafor a Known failures bullet; file the `fixtures/full` rotor defect (#86). Alternative: the Owner opening each trace in LangSmith, as the ticket planned; Eastside as a judge disagreement waiting on calibration labels. Trade-off: the trace reading is the agent's, not the Owner's; the after run's Eastside `page_faithful` 0 stays unexplained.
- [0049 The recording script and the trace-link set](0049-recording-script-and-trace-links.md): an unlisted recording of about 2:30 made from the merged README (Inbox, Approve on the renewal card, that turn's production trace, the before/after table); four trace links, the recording's own as the happy path plus one per narrated failure; retention extended through the API flag by 2026-11-01 (#88); `<!-- submission-day -->` placeholders cleared by a final grep. Alternative: a before-and-after pair per failure, which four links can't hold; Deny in the recording, already a narrated failure; making links early, which doesn't help because an expired trace takes its share link with it. Trade-off: one trace per failure instead of a pair; whether the free tier accepts the retention flag is unconfirmed.
- [0050 Synthesise the submission spec and ticket graph](0050-submission-spec-and-ticket-graph.md): spec #90 with five tickets; the README is one ticket, blocked by the moves and the run entries; only the three run files come from `wayfinder/49-eval-story`, and the build runs under the flow on `main`; triage's Eastside narration is the one scope exception; eight Known failures bullets; checks without new test code. Alternative: slicing the README into tickets (merge conflicts); the per-ticket-PR flow on the local branch; seven bullets. Trade-off: the run-entries ticket can't run on a fresh clone, because two of its files exist only in the Owner's checkout.
- [0054 Implement spec #90 (the submission README)](0054-implement-submission-readme-spec.md): five tickets on one integration branch; the four trace URLs as shared reference definitions, so the README holds seven placeholders; the generated blocks wrapped in `prettier-ignore` so `eval:diff` stays byte-identical; landed run entries copied word for word, with derived figures kept in their notes. Alternative: inline trace placeholders (ten, not seven); changing `scripts/eval-diff.ts`, which the spec put out of scope. Trade-off: the checklist names README link labels and headings, so renaming one means editing both files.
- [0055 Submission day, the agent's steps of the checklist](0055-submission-day-links.md): retention extended on the three narrated-failure traces through API feedback, `demo` reseeded, and three public share links plus the date filled in the README. Alternative: the issue #88 fallback (after traces with an expiry date), which wasn't needed. Trade-off: the recording-dependent slots stay open for the Owner.

### Interview preparation

- [0056 Prepare the interview script and repeatable happy path](0056-interview-script-and-happy-path.md): use a separate local namespace and the existing approval eval for rehearsals. Alternative: repeat against the shared deployed demo. Trade-off: a controlled local fixture avoids other visitors' changes, but live model output and approval completion still need rehearsal.

- [0058 Explain the graph implementation](0058-explain-graph-implementation.md): explicitly describe the Neighbourhood as a Page graph and add interview narration. Alternative: retain only the Neighbourhood name. Trade-off: distinguish the implemented capability from its disabled default and the standard demo.

- [0059 Use Graph RAG terminology](0059-use-graph-rag-terminology.md): use the Owner's preferred name in the README and interview script. Alternative: Neighbourhood. Trade-off: configuration identifiers retain their existing names so commands remain valid.

- [0060 Rename the Graph RAG configuration switch](0060-rename-graph-rag-switch.md): use `CLERK_RETRIEVAL_GRAPH_RAG` in code and usage docs. Alternative: retain the old environment name. Trade-off: existing external settings must adopt the new name; runtime defaults remain unchanged.

### ADRs

- [ADR 0001 The Wiki lives in an app-runtime store, not the Eve sandbox](../adr/0001-wiki-in-app-runtime-store-not-sandbox.md): one `WikiStore`, with a local directory for dev and evals and private Blob when deployed. Alternative: the Eve sandbox, file tools, `defineState`, or the memory provider (all per-session or capped); Neon as the fallback. Trade-off: evals run only locally (the Hobby cap is 2,000 operations a month); no upload through chat.
- [ADR 0002 The retrieval cache lives under a hidden prefix](../adr/0002-retrieval-cache-hidden-prefix.md): an in-process memo validated by an etag `manifest`, with embeddings in `cache/embeddings.json`. Alternative: a sibling namespace, invalidation from the write tools, a dotted prefix, or Neon. Trade-off: one Blob operation per search (about 50 a month); a future Page folder must keep excluding `cache/`.
