import assert from "node:assert/strict";
import { test } from "node:test";
import type { EveEvalStreamEvent } from "eve/evals";
import { firstToolCall, scoreRetrieval } from "./answers";

const requested = (...names: string[]) =>
  ({
    type: "actions.requested",
    data: {
      actions: names.map((toolName) => ({ kind: "tool-call", toolName })),
    },
  }) as unknown as EveEvalStreamEvent;

test("the first tool call is the first tool-call action requested in the run", () => {
  const events = [
    { type: "turn.started", data: {} } as unknown as EveEvalStreamEvent,
    requested("read_index", "read_page"),
    requested("search_wiki"),
  ];

  assert.equal(firstToolCall(events), "read_index");
  assert.equal(firstToolCall(events.slice(2)), "search_wiki");
  assert.equal(firstToolCall([]), undefined);
});

test("the Rung metrics are recorded as labelled soft scores with no gate", () => {
  const recorded: { label?: string; score: number; gated: boolean }[] = [];
  const t = {
    score(evaluation: { score: number }) {
      const entry = { score: evaluation.score, gated: false } as {
        label?: string;
        score: number;
        gated: boolean;
      };
      recorded.push(entry);
      const handle = {
        label(key: string) {
          entry.label = key;
          return handle;
        },
        gate() {
          entry.gated = true;
          return handle;
        },
        atLeast() {
          entry.gated = true;
          return handle;
        },
      };
      return handle;
    },
  } as unknown as Parameters<typeof scoreRetrieval>[0];

  scoreRetrieval(
    t,
    ["2026-08-22-receipt-dockside-deli"],
    [
      {
        name: "search_wiki",
        output: {
          rung: "lexical",
          hopRan: false,
          matches: ["summaries/2026-08-22-receipt-dockside-deli.md"],
          neighbours: [],
        },
      },
    ]
  );

  assert.deepEqual(recorded, [
    { label: "searched", score: 1, gated: false },
    { label: "rung_embedding", score: 0, gated: false },
    { label: "hop_added", score: 0, gated: false },
    { label: "expected_in_result", score: 1, gated: false },
    { label: "expected_via_hop_only", score: 0, gated: false },
  ]);
});
