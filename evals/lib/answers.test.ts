import assert from "node:assert/strict";
import { test } from "node:test";
import type { EveEvalStreamEvent } from "eve/evals";
import { firstToolCall } from "./answers";

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
