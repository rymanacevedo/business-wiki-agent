# Clerk, the business wiki agent

> Draft from the deploy ticket (#25). The full README (Start here, What Clerk
> does, Evals, What broke, Traces, Production evaluation, Coding assistants,
> Repo map) lands with the submission ticket; this draft holds the parts the
> deploy settles.

## Try this first

The demo is seeded from the `full` fixture with three Sources held back in
the Inbox: a plain receipt, a renewed insurance certificate, and a second
copy of invoice 4471 stamped PAID. Open the deployed URL and send these
three messages (the landing page offers them as buttons):

1. **What's in my Inbox?** Clerk lists the three held-back Sources.
2. **Ingest the renewed insurance certificate.** The new certificate
   supersedes the insurance expiry in the Profile, an Established Fact, so
   Clerk proposes the change through `change_fact` and stops at an Approval
   card showing the old and new values. Approve or deny it.
3. **When does our insurance renew? Link the Page.** Clerk answers with a
   Citation. Click it to open the Page in the read-only wiki browser
   (`/wiki`, the Index is its landing page).

To go further, "Ingest the rest of the Inbox" walks the plain receipt (no
Approval) and the PAID copy of 4471, which proposes marking the invoice paid.

The demo resets only when the Owner reseeds it
(`bun run wiki:seed --ns demo --fixture full --force` with `VERCEL=1`); there
is no reset tool. Every Reviewer shares the one `demo` Wiki.

## Talking to the deployed agent

`<deployed-url>` is filled in after the first deploy.

```bash
curl https://<deployed-url>/eve/v1/health
eve remote connect --url https://<deployed-url>

# One turn over the HTTP channel: create a session, then read its stream.
curl -s -X POST https://<deployed-url>/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"What is our EIN?"}'
# -> {"ok":true,"sessionId":"wrun_...","status":"accepted"}
curl -sN https://<deployed-url>/eve/v1/session/<sessionId>/stream
# NDJSON events; the answer arrives as message.appended deltas, the turn ends at session.waiting.
```

## Evals

Generate the before-and-after comparison with
`bun run eval:diff <before-label> <after-label>`.

<!-- eval-diff:start -->

| Slice                               | Cases | Pass rate before | Pass rate after | Mean tool calls | Cost              |
| ----------------------------------- | ----- | ---------------- | --------------- | --------------- | ----------------- |
| ingest                              | 30    | 25/30 (83%)      | 26/30 (87%)     | 8.5 → 8.4       | $0.4401 → $0.4375 |
| lint                                | 5     | 4/5 (80%)        | 5/5 (100%)      | 3.0 → 3.4       | $0.0366 → $0.0399 |
| query                               | 17    | 14/17 (82%)      | 17/17 (100%)    | 2.0 → 2.1       | $0.0891 → $0.0891 |
| safety                              | 13    | 10/13 (77%)      | 12/13 (92%)     | 9.8 → 9.4       | $0.2808 → $0.2781 |
| **total**                           | 65    | 53/65 (82%)      | 60/65 (92%)     | 6.6 → 6.6       | $0.8467 → $0.8446 |
| **total, without dataset-fix rows** | 60    | 53/60 (88%)      | 57/60 (95%)     | 6.6 → 6.6       | $0.7742 → $0.7766 |

5 rows changed what they expect between the runs (dataset fixes, not agent changes): ingest/sources/0018, ingest/sources/0021, ingest/sources/0029, lint/checks/0004, safety/approvals/rows/0004. The last total leaves them out.
<!-- eval-diff:end -->

## Known failures and limitations

### Limitations we chose

- **The demo URL is unauthenticated.** The web chat and the HTTP channel
  accept anyone (`none()` after `vercelOidc()` and `localDev()` in
  `agent/channels/eve.ts`), so a Reviewer needs no credentials. Anyone with
  the URL can spend the Gateway budget and change the shared `demo` Wiki
  (changes to Established Facts still need an Approval click, which the same
  anonymous visitor can give). The one-line fix: replace `none()` with
  `httpBasic({ username: "reviewer", password: process.env.ROUTE_AUTH_BASIC_PASSWORD ?? "" })`
  and add the matching Basic-auth check to `apps/web/proxy.ts`, so the
  `/wiki` pages are covered too.
- **No rate limit.** The per-session caps in `agent/agent.ts` (about $1 of
  tokens and 300K input tokens per session) are the only abuse mitigation;
  nothing stops many sessions.
- No document upload: Sources are pre-placed by the seed script.
- Single eval runs, so no variance estimate.
- The judge's boolean probability is reported by the judge model itself;
  it is not computed from token probabilities.
- **The judge is uncalibrated.** The Owner has not yet hand-labelled the
  calibration rows in `docs/evals/runs/before/calibration.yaml`, so
  [the calibration page](docs/evals/calibration.md) reports no agreement or
  kappa, and the judges keep their uncalibrated `.atLeast` threshold. Read
  the soft scores as indicative only. Filling the labels and running
  `bun run eval:calibration before` regenerates the page.
- Cold-start Profile creation is untested.
- The cost cap is covered by a unit test only.
- Lint is model-driven.
- Text-only Sources, with receipts as rough OCR text.
- No embeddings: Clerk navigates by the Index and a substring search.
- The Business and Corpus are fictional.
- LangSmith keeps traces for 14 days.
- Evals run only against the local store; the deployed Wiki lives in a
  private Vercel Blob store whose Hobby quota (2,000 advanced operations a
  month) covers seeding and demo sessions, not eval runs.

### Failures we saw

Filled in at triage.
