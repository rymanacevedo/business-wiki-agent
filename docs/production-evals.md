# Evaluating Clerk in production

The offline suite ([datasets and evaluators](evals/README.md)) tells us
whether a change makes Clerk worse on cases we already know. Production
evaluation has two other jobs. It catches the cases we do not know yet, and
it notices when the instruments themselves drift. The plan has five parts.
All of them work on the traces Clerk already sends to the LangSmith project
`business-wiki-agent-production` over OpenTelemetry. Traces hold masked
Source text only, because Masking happens before Clerk reads a Source.

## 1. Sampling

Not every turn needs a judge. Sample by risk:

- **100% of Approval requests and denials.** Every `change_fact` the Owner
  saw, whether approved or denied. The trust boundary is the product's main
  claim, so every crossing gets read.
- **100% of answers that use the fixed phrase** ("That isn't in the wiki.")
  **or carry no Citation.** Both are where Clerk is most likely to be wrong
  quietly: a false "not in the wiki" when the Page exists, or an uncited
  fact.
- **10% of all other Queries,** sampled at random, for a baseline that is
  not biased toward trouble.

Ingest and Lint turns are covered by the deterministic monitors (part 4),
not by sampling.

## 2. Online judges into an annotation queue

The offline `faithful` and `cited` judges run asynchronously on the sample,
after the turn has finished, so the Owner never waits on them. They see the
same state they see offline: the answer, and the Pages it read and linked.
A score below threshold sends the trace to a LangSmith annotation queue. The
Owner works through the queue once a week and labels each item: was the
judge right, and was Clerk right?

## 3. Judge drift: a weekly relabel

Twenty items a week, drawn from the sample whatever the judge scored, are
labelled by hand. Agreement and Cohen's kappa against those labels are
tracked week over week, the same measures the
[offline calibration](evals/calibration.md) uses. When agreement drops, the
thresholds are recalibrated from the latest labels before anyone trusts a
judge-mean trend again. The judge model is a pinned free chat model reporting
its own confidence, so this check matters more here than it would with a
token-level judge.

## 4. Deterministic monitors from traces

These need no judge. Each one is a query over the trace tree, run on every
production trace:

- **A write tool before `read_index`.** `create_page`, `update_page`,
  `append_log`, `note_also_seen_in`, or `change_fact` was called in a turn
  before Clerk read the Index.
- **`change_fact` without an Approval.** A `change_fact` tool run with no
  approved input response before it. The Approval gate makes this
  impossible by construction, and the monitor proves it stays that way.
- **A PII regex hit on any output.** An answer, tool argument, or Page write
  that matches a full SSN or an 8-to-19-digit account number. Masking should
  make this impossible too.
- **Session cost.** Token cost and input tokens per session, against the
  per-session caps in `agent/agent.ts` (about $1 and 300K input tokens).

## 5. Alerting and the loop back to the dataset

- **Page someone** on a PII hit or a `change_fact` without an Approval.
  Either one means a trust boundary failed.
- **Warn** on a drop in the weekly judge mean, a drop in judge agreement, or
  cost per session drifting up.
- **Every confirmed production failure becomes a dataset row.** Once it is
  labelled in the annotation queue, it goes into the slice it belongs to,
  with its class tag and a deterministic check where one fits, and a judge
  rubric only where none does. The Corpus is generated from the Bible, so a
  failure on a new kind of document becomes a Bible edit and a regenerated
  Source.
- **The offline suite runs in CI** on every change to the instructions,
  the Schema, or a tool. Both invocations run, and the before/after diff
  against the last accepted run goes on the pull request.
