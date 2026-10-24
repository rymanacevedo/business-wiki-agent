# Submission-day checklist

For the Owner. Not linked from the README. Tick each step on the day. The
numbered steps run in order, from the merged submission README to sending
the links. Each slot the README leaves for the day is marked
`<!-- submission-day -->`.

## Done

- [x] **Deploy and confirm the URL.** Deployed 2026-10-19 to
      https://business-wiki-agent.vercel.app: the health check answers, the
      landing page and `/wiki` load, and a curl turn answered with a Citation.
      Redeploy with `eve deploy` from the main checkout, then restore
      `LANGSMITH_PROJECT=business-wiki-agent-local` in `.env.local`.
- [x] **Check production traces.** Demo turns appear in LangSmith project
      `business-wiki-agent-production`, with the run tree intact, chat
      messages and tokens shown, and tool arguments and results shown.
- [x] **Take the two screenshots.** Both are committed,
      [the Approval card](images/approval-card.png) and
      [the wiki browser on the Index](images/wiki-index.png), and the README
      links them.
- [x] **Confirm the narrated failures** against their traces. Done in
      [Task: confirm the narrated failures against their traces](https://github.com/rymanacevedo/business-wiki-agent/issues/78);
      `docs/evals/triage.md` matches them.

## Optional

- [ ] **Label the calibration rows** if there is time: fill `faithful` and
      `cited` in `docs/evals/runs/before/calibration.yaml`, run
      `bun run eval:calibration before`, copy the chosen thresholds into the
      judges' `.atLeast`, and update the "judge is uncalibrated" lines in the
      README and `docs/evals/README.md`.

## On the day, in order

1. [ ] **Extend retention on the three failure traces by 2026-11-01.**
       Follow
       [Extend retention on the three narrated-failure traces by 2026-11-01](https://github.com/rymanacevedo/business-wiki-agent/issues/88):
       post one feedback item to each root run through the API with
       `extend_trace_retention=true`, then confirm each reads
       `trace_tier: longlived`. If the free tier refuses or it costs more than a
       few cents, take that issue's fallback: in step 5, link the **after** traces
       for deny and ingest-everything, reword those two lines to "the fix", and
       put the expiry date next to the links.
2. [ ] **Reseed `demo`** so the Inbox holds the three Sources again:
       `VERCEL=1 bun run wiki:seed --ns demo --fixture full --force` (set
       `VERCEL` inline only, never export it).
3. [ ] **Record the screen capture**, after the submission README is merged on
       `main`, so the before/after table on screen is the final one. About 2:30,
       voice-over without a script read aloud, uploaded to YouTube as an unlisted
       video. Five beats:

   - **0:00–0:15**: the landing page, with a one-line pitch: Clerk keeps the
     Business's records in a Wiki it maintains.
   - **0:15–0:40**: "What's in my Inbox?" lists the three held-back Sources.
   - **0:40–1:25**: "Ingest the renewed insurance certificate." brings up the
     Approval card with the old and new values. **Approve** (not Deny), let
     Clerk finish, then take a quick look at the updated Page in `/wiki`. Skip
     the Citation question to stay under 3 minutes.
   - **1:25–2:05**: the same turn's trace in LangSmith project
     `business-wiki-agent-production`: the run tree, the `change_fact` call and
     its approval, then the INGEST line.
   - **2:05–2:30**: the README before/after table, with one sentence per loop,
     then a pointer to the narrated failures.

   Put the unlisted YouTube URL in the README's Screen recording row, in place
   of its `<!-- submission-day -->` placeholder.

4. [ ] **Share the recording's own trace as the happy path.** In LangSmith
       project `business-wiki-agent-production`, make a public share link for the
       turn from step 3 (Ingest, then Approve). Put it in the README Traces
       section's happy-path item, in place of its `<!-- submission-day -->`
       placeholder.
5. [ ] **Make the three failure share links** in LangSmith project
       `business-wiki-agent-evals`, and put each in its README Traces item, in
       place of its `<!-- submission-day -->` placeholder:

   - Supersession deny: the **before** trace
     `00000000-0000-0000-dc7d-5c056b113c6b`.
   - Eastside, "judge right, checks blind": `query-van-repair-bill` in
     **`retrieval-after`**, the run ending `…-edab-35165e29179c`.
   - "Ingest everything new": the **before** trace
     `00000000-0000-0000-1da5-33d341312aa4`.

   Then stamp today's date as the "generated on" date in the README Traces
   section, in place of its `<!-- submission-day -->` placeholder.

6. [ ] **Reseed `demo` again** so the Inbox holds the three Sources for the
       Reviewer: `VERCEL=1 bun run wiki:seed --ns demo --fixture full --force`.
       Traces don't depend on the Wiki, so the share links stay valid.
7. [ ] **Edit "What I checked myself"** in the README to match what you
       actually did, and remove its `<!-- submission-day -->` marker.
8. [ ] **Check no placeholder is left:** run
       `grep -n 'submission-day' README.md`. It must print nothing.
9. [ ] **Flip the repository public** on GitHub.
10. [ ] **Send the links**: the repository, the deployed URL, and the
        recording.
