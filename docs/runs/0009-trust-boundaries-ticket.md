# 0009: Resolve the trust boundaries ticket

- **When**: 2026-10-17
- **Agent**: Claude Code, Claude Fable 5.1
- **Driving**: [Wayfinder map: business wiki agent take-home spec](https://github.com/rymanacevedo/business-wiki-agent/issues/1), ticket [Trust boundaries: approvals, PII handling, and injection defense](https://github.com/rymanacevedo/business-wiki-agent/issues/9)

## Goal

Work through the map: take the next frontier ticket and resolve it by grilling.

## What happened

1. Re-queried the frontier (trust boundaries, schema prototype, persistence shape were open and unblocked); claimed the trust-boundaries ticket as first in map order.
2. Pulled facts first: Eve's approval policies (`never`/`once`/`always`/custom function, approved calls run as the requester, a denial's text reaches the model), the trace research's `tracePolicy` finding, and the persistence research's read-only Source path.
3. Round 1 put eight decisions to the human: approval expressed as distinct tools with declarative policies and no delete tool; Contradiction recorded free versus Supersession proposed under Approval; denial behaviour; Masking at the `read_source` boundary; traces recording inputs and outputs; injection posture (delimit, instruct, flag, no default tools); facts-not-advice with a fixed not-in-the-wiki phrase; Source immutability in tooling. All accepted.
4. Round 2 closed two silent assumptions: Masking covers exactly SSNs and financial account numbers, and Lint has five fixed sections with a 30-day upcoming window. Accepted.
5. Posted the resolution with the eval case each decision implies, closed the ticket, appended the gist to the map, pointed the eval-design ticket at the case list, and added Contradiction, Supersession, Masking, and Suspicious Content to `GLOSSARY.md`.

## Findings worth remembering

- Masking before the model is what makes "record inputs and outputs in traces" safe; the two decisions are coupled and the README should say so.
- Having no delete tool removes the most obvious injection payoff without any detection logic.
- The fixed phrase "That isn't in the wiki" is a deliberate crutch for a deterministic check; the judge handles everything else about refusals.

## What the human checked

- Accepted every recommendation in both rounds without amendment.

## Open questions

- How the Owner answers an Approval in the demo channel (TUI versus web chat) belongs to the persistence and deployment ticket.
- The exact regex set for Masking is the implementing agent's call; the eval checks the outcome, not the pattern.

## Artifacts

- Resolution: https://github.com/rymanacevedo/business-wiki-agent/issues/9#issuecomment-6245231919
- `GLOSSARY.md` (new "Trust" section), this run file.
