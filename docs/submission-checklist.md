# Submission-day checklist

For the Owner. Not linked from the README. Tick each step on the day.

- [ ] **Deploy and confirm the URL.** Retry the deploy once Vercel's
      free-plan upload limit has reset (`eve deploy` from the main checkout,
      then restore `LANGSMITH_PROJECT=business-wiki-agent-local` in
      `.env.local`). Check that `curl https://<url>/eve/v1/health` answers, the
      landing page loads, and `/wiki` shows the Index. Replace every
      `<deployed-url>` in `README.md`.
- [ ] **Check production traces.** One demo turn appears in LangSmith project
      `business-wiki-agent-production`, with the run tree intact, chat
      messages and tokens shown, and tool arguments and results shown.
- [ ] **Reseed `demo`** so the Inbox holds the three Sources again:
      `VERCEL=1 bun run wiki:seed --ns demo --fixture full --force` (set
      `VERCEL` inline only, never export it).
- [ ] **Take the two screenshots** (optional) and save them as
      `docs/images/approval-card.png` (the Approval card in the chat after
      "Ingest the renewed insurance certificate.") and
      `docs/images/wiki-index.png` (the wiki browser on the Index). Reseed
      `demo` again afterwards. If you skip them, delete the screenshot line
      under "Try this first" in the README.
- [ ] **Label the calibration rows** if there is time: fill `faithful` and
      `cited` in `docs/evals/runs/before/calibration.yaml`, run
      `bun run eval:calibration before`, copy the chosen thresholds into the
      judges' `.atLeast`, and update the "judge is uncalibrated" lines in the
      README and `docs/evals/README.md`.
- [ ] **Confirm the narrated failures** against their traces and edit
      `docs/evals/triage.md` and the README quotes to match (the judge
      disagreement may move to a calibration row once labelled).
- [ ] **Create the public share links** in LangSmith for the four traces
      (Supersession deny, Eastside judge disagreement, ingest everything new,
      and one happy-path Ingest with an Approval). Put them in the README
      Traces section and stamp the "links generated on" date (14-day
      retention).
- [ ] **Edit "What I checked myself"** in the README to match what you
      actually did, and remove its draft marker.
- [ ] **Record the screen capture**: from the Inbox to an Approval card,
      opening one trace in LangSmith, and scrolling the before/after table.
      Reseed `demo` afterwards.
- [ ] **Flip the repository public** on GitHub.
- [ ] **Send the links**: the repository, the deployed URL, and the
      recording.
