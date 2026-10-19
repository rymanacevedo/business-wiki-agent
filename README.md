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
