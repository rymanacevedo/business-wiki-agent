# 0007: Resolve the seed corpus ticket

- **When**: 2026-10-17
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Fictional business and seed corpus: documents, receipts, and planted traps](https://github.com/rymanacevedo/business-wiki-agent/issues/8)

## Goal

Work through the map: take the first frontier ticket and resolve it by grilling.

## What happened

1. Loaded the map and queried the children. Four tickets were on the frontier (seed corpus, trust boundaries, schema prototype, persistence shape); the seed corpus ticket came first in map order, so it was claimed.
2. Round 1 proposed a specific Colorado bakery with industry permits. The human rejected it as "far too specific" and asked for one size fits all. Everything else in round 1 (corpus mix, text-only format, eight Traps, a frozen Demo Date, agent-generated Corpus, a Manifest as ground truth) was accepted.
3. Round 2 re-pitched the business as a generic single-owner repair shop generated from a parameterised **Bible**, with closed lists for Obligation kinds and expense categories so deterministic checks stay simple. Accepted in full.
4. Posted the resolution on the ticket, closed it, appended the gist to the map's Decisions so far, and pointed the schema prototype ticket at the default Bible instance and the closed lists.
5. Added Corpus, Bible, Trap, Manifest, and Demo Date to `GLOSSARY.md`.

## Findings worth remembering

- The Business is a parameter, not a fixture: swapping it means editing the Bible and regenerating the Corpus. The spec should say so explicitly.
- "Legitimate supersession" (a renewed certificate) is a distinct Trap from "contradiction": the first needs Approval, the second needs a Lint flag. Evals must tell them apart.
- `read_file` can show PDFs and images to Sonnet 5.5, but the scope decision drops the default tools, so vision would cost a custom path. Text-only is the deliberate cut.

## What the human checked

- Rejected the specific-business pitch and set the one-size-fits-all direction themselves.
- Accepted the Trap list, the closed lists, the Demo Date, and the Bible/Manifest split as recommended.

## Open questions

- Raw file naming for Sources and the Manifest's exact format are left to the schema prototype and the implementing agent.
- What Traps 5 (PII) and 6 (injection) must produce is the trust-boundaries ticket's call.

## Artifacts

- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/8#issuecomment-6245114478
- `GLOSSARY.md` (new "The seed corpus" section), this run file.
