import assert from "node:assert/strict";
import { test } from "node:test";
import { driveSegments } from "./drive";

type Fake = {
  name: string;
  status: string;
  events: unknown[];
  inputRequests: unknown[];
  toolCalls: { name: string }[];
  session: { respond: () => Promise<Fake>; send: () => Promise<Fake> };
};

test("every segment of a turn continued past a session limit is kept, in order", async () => {
  const session = {
    respond: async () => continued,
    send: async () => continued,
  };
  const continued: Fake = {
    name: "continued",
    status: "completed",
    events: [],
    inputRequests: [],
    toolCalls: [{ name: "read_page" }],
    session,
  };
  const first: Fake = {
    name: "first",
    status: "waiting",
    events: [],
    inputRequests: [
      {
        kind: "session-limit",
        requestId: "r1",
        options: [{ id: "continue", label: "Continue" }],
      },
    ],
    toolCalls: [{ name: "read_index" }, { name: "search_wiki" }],
    session,
  };
  const t = {
    send: async () => first,
    log: () => {},
    sleep: async () => {},
    signal: { aborted: false },
  } as unknown as Parameters<typeof driveSegments>[0];

  const { turn, segments } = await driveSegments(t, "query-x", "Question?");

  assert.equal((turn as unknown as Fake).name, "continued");
  assert.deepEqual(
    segments.flatMap((s) => s.toolCalls.map((c) => c.name)),
    ["read_index", "search_wiki", "read_page"]
  );
});
