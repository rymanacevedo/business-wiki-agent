# 0051: Decide the eval story for retrieval

- **When**: 2026-10-23
- **Agent**: Claude Code (Fable 5.1)
- **Driving**: [The eval story for retrieval](https://github.com/rymanacevedo/business-wiki-agent/issues/49) on [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42)

Originally 0027 on `wayfinder/49-eval-story`.

## Goal

Work the last decision ticket of the retrieval map: how the evals show retrieval doing work the Index alone could not, which rows, which runs, how the Rung reaches the report, and the rules that decide whether embeddings and the Neighbourhood stay.

## What happened

1. Loaded the map; the frontier held one ticket. Claimed it, then read the resolutions of the Link model, the prototype and the seam ticket, the Query and Lint slices, the reporter and diff code, the committed runs, the Manifest, the Index, and Eve's eval docs.
2. One fact reframed the ticket: no committed run ever called `search_wiki`, and Query rows average two tool calls. The Index and the Profile settle every existing row, and the bank statement summaries name their vendors, so the fixture gives a Link little to add. The eval story was therefore framed as a measurement with Index-hostile rows and an honest README, not a promise that retrieval wins.
3. Grilled in two rounds, sixteen questions. Round one fixed the frame, the rows' home (the Query slice, tagged `retrieval` and `retrieval:<rung written for>`), the unchanged trajectory, Lint and judges, the structured `search_wiki` output behind `toModelOutput` with five soft metrics, the four labelled runs, the pre-registered decision rules, the offline bench for ordering, floor and kind prior, the second README diff block, and the fog entry about skipping the Index (resolved: no). Round two fixed the eight rows, the one instruction sentence, and the tag schema. The human accepted every recommendation and brought a reviewer's tightening of four row expectations (payment-status words instead of a due date, an affirmative payment pattern, an explicit statement reference, the fixed abstention phrase kept as a product contract), all adopted.
4. Posted the resolution, closed the ticket, appended the gist to the map, cleared the fog (now empty), and left the spec task its inputs. The spec task is unblocked and is the map's last ticket.

## Findings worth remembering

- The free-tier eval story has had zero retrieval traffic; any retrieval claim in the README must rest on the new rows and the Rung metrics, not on the existing 17.
- Eve's eval runner exposes tool outputs (`t.calledTool(name, { output })`), so a tool can carry structured facts to the evals while `toModelOutput` keeps them from the model.
- `judgedPages` ignores bare `(src: id)` Citations; retrieval excerpts make that gap more likely to matter. Left as a named limitation because Page selection is out of scope.
- "cash" and "Okafor" appear on no Index or Profile line; the Ridgeline and Eastside Pages share no term with the semantic rows' wording; no Page mentions workers' compensation or an invoice late fee.

## What the human checked

The human accepted every recommendation in both rounds and supplied the reviewer's tightening of rows 4 to 8. The fixture and code facts were gathered by the agent and not independently verified by the human in this session.

## Open questions

- Whether `retrieval-before` already passes the semantic and Neighbourhood rows; if it does, the README says so and the rules decide the cuts.
- The spec task owns the Blob latency measurement, the README wording, and the ordering of the implementation tickets (rows and baseline tag first).

## Artifacts

- Ticket: [The eval story for retrieval](https://github.com/rymanacevedo/business-wiki-agent/issues/49) (closed, resolution comment)
- Map: [Wayfinder map: agentic GraphRAG retrieval for Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/42) (Decisions-so-far appended; fog empty)
- Spec task: [Task: synthesise the retrieval spec and implementation ticket graph](https://github.com/rymanacevedo/business-wiki-agent/issues/50) (inputs comment; unblocked)
- Branch: `wayfinder/49-eval-story`
