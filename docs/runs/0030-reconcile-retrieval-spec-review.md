# 0030: Reconcile the retrieval spec and tickets with a review

- **When**: 2026-10-23
- **Agent**: Claude Code (Fable 5.1)
- **Driving**: ad hoc: a pasted review of [Spec: Retrieval for Clerk, hybrid Matches and a Neighbourhood behind search_wiki](https://github.com/rymanacevedo/business-wiki-agent/issues/53) and its sub-issues, with "feel free to give push back"

## Goal

Check six review findings and two design questions against the live issues and the fixture, apply the mechanical corrections directly, flag anything that changes an accepted decision, and keep the spec and ticket acceptance criteria consistent without touching the blocking edges.

## What happened

1. Fetched the live bodies of the spec and all ten tickets and diffed them against what the previous session posted: unchanged, no comments, every `blocked_by` count intact. So nothing was already addressed.
2. Checked finding 6 in `fixtures/full`: the Eastside Page says "vehicle repair parts", "front brake service" and carries category `vehicle`, so row 4 shares `service` and `vehicle` with its answer Page. Confirmed. Row 3 (Ridgeline) shares nothing; `diagnostic` appears only on a Cascade Page, which makes it a clean semantic test.
3. Read the dataset's `cites` semantics (string is a substring, a nested list is any-of, Source ids match summary paths by substring) so the metric and bench definitions could name them exactly.
4. Applied the mechanical corrections to the spec and to the rows, embeddings, bench, metrics and after-runs tickets: per-configuration test expectations with no required Page for absent rows; "zero Page-section embeddings" with the query embedding counted separately; metrics defined over every call with the two expected-Page metrics omitted for rows without `cites`; MRR defined for required and any-of citations, missing results and multi-turn rows, with each knob varied one at a time from the pre-registered defaults; the bench moved to the first slot after Links and frozen before any after run; a gate on the rows ticket that row 4 is settled before the tag.
5. Posted four items for the Owner's decision as a comment on the spec: the row 4 rewording (proposed "What did the garage charge for the stopping repairs?", no shared token), making `list_flagged` never-cut (recommended accept), a stricter embeddings rule with ties to lexical-only (recommended accept, keeping the 2-of-3 rerun precedent for any deciding row), and the bench tie rule read as "ties to the pre-registered default" (applied, reversible).
6. The Owner accepted all four. Applied: row 4 reworded on the rows ticket and its review gate removed; `list_flagged` moved from the scope cuts to the never-cut line; the embeddings rule replaced in the spec and on the after-runs ticket (no retrieval-row regression against lexical-only, no other regression, demonstrated benefit, ties to lexical-only, deciding rows rerun 2 of 3); an amendment comment on the eval ticket records the three changed items.
7. Pushed back on one point: the spec never claimed hybrid searches are offline; one user story was reworded and the embeddings ticket now says each search embeds its query through the Gateway.

## Findings worth remembering

- The eval ticket's bench rule contained two sentences that disagree on the floor ("ties to the simpler rule" versus "defaults if flat: floor a third"); the bodies now follow the second.
- `garage`, `charge` and `stopping` appear nowhere in `fixtures/full`, which is what makes the proposed row 4 wording a zero-overlap row; `repairs` and `repair` are distinct tokens because the tokeniser has no stemmer.
- Nothing in the review required touching the Links, store, package, `list_flagged` or eval-diff tickets.

## What the human checked

The review itself came from the human, with permission to push back. They accepted all four decisions on the spec comment, which were then applied.

## Open questions

- Run number collision: another session has an uncommitted `0029-double-check-github-retrieval-spec.md` in the working tree while this branch's 0029 is committed; whichever lands on `main` second needs renumbering.

## Artifacts

- Spec comment: https://github.com/rymanacevedo/business-wiki-agent/issues/53#issuecomment-6371359607
- Edited bodies: #53, #54, #58, #60, #61, #63
- Branch: `wayfinder/50-retrieval-spec` (PR #64)
