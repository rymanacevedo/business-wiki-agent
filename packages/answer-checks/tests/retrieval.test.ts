import assert from "node:assert/strict";
import { test } from "node:test";
import { retrievalMetrics } from "../index";

const search = (output: {
  rung?: string;
  hopRan?: boolean;
  matches?: string[];
  neighbours?: string[];
}) => ({
  name: "search_wiki",
  output: {
    rung: "lexical",
    hopRan: false,
    matches: [],
    neighbours: [],
    text: "rendered",
    ...output,
  },
});
const read = { name: "read_index", output: { text: "index" } };

const CASH = [
  "2026-08-22-receipt-dockside-deli",
  "2026-09-12-invoice-cascade-parts-4472",
];

test("a row that never searched scores 0 on every metric it records", () => {
  assert.deepEqual(retrievalMetrics(CASH, [read]), {
    searched: 0,
    rung_embedding: 0,
    hop_added: 0,
    expected_in_result: 0,
    expected_via_hop_only: 0,
  });
});

test("an absent row (no cites) records only the three Rung metrics", () => {
  assert.deepEqual(retrievalMetrics([], [read, search({})]), {
    searched: 1,
    rung_embedding: 0,
    hop_added: 0,
  });
});

test("every required cite found among the Matches of any call puts the expected Pages in the result", () => {
  const metrics = retrievalMetrics(CASH, [
    read,
    search({ matches: ["summaries/2026-08-22-receipt-dockside-deli.md"] }),
    search({
      matches: ["summaries/2026-09-12-invoice-cascade-parts-4472.md"],
    }),
  ]);
  assert.equal(metrics.expected_in_result, 1);
  assert.equal(metrics.expected_via_hop_only, 0);
});

test("a required cite missing from every call keeps the expected Pages out of the result", () => {
  const metrics = retrievalMetrics(CASH, [
    search({ matches: ["summaries/2026-08-22-receipt-dockside-deli.md"] }),
    // 4471 is not 4472: the substring has to match the whole id.
    search({ matches: ["summaries/2026-09-12-invoice-cascade-parts-4471.md"] }),
  ]);
  assert.equal(metrics.expected_in_result, 0);
  assert.equal(metrics.expected_via_hop_only, 0);
});

test("a nested list is any-of, and a Page path matches as-is", () => {
  const cites = [
    ["2026-11-15-insurance-cert-meridian", "obligations/2026-11-15-"],
    "profile.md",
  ];
  const metrics = retrievalMetrics(cites, [
    search({
      matches: [
        "profile.md",
        "obligations/2026-11-15-insurance-renewal-meridian.md",
      ],
    }),
  ]);
  assert.equal(metrics.expected_in_result, 1);
});

test("a cite reached only through a neighbour, never a Match, counts as via the hop only", () => {
  const metrics = retrievalMetrics(
    [
      "2026-08-20-invoice-ridgeline-tools-r20931",
      "2026-08-31-bank-statement-tidewater",
    ],
    [
      search({
        hopRan: true,
        matches: ["summaries/2026-08-20-invoice-ridgeline-tools-r20931.md"],
        neighbours: ["summaries/2026-08-31-bank-statement-tidewater.md"],
      }),
    ]
  );
  assert.deepEqual(metrics, {
    searched: 1,
    rung_embedding: 0,
    hop_added: 1,
    expected_in_result: 1,
    expected_via_hop_only: 1,
  });
});

test("a cite that was a Match in another call is not via the hop only", () => {
  const statement = "summaries/2026-08-31-bank-statement-tidewater.md";
  const metrics = retrievalMetrics(
    ["2026-08-31-bank-statement-tidewater"],
    [
      search({ hopRan: true, neighbours: [statement] }),
      search({ matches: [statement] }),
    ]
  );
  assert.equal(metrics.expected_in_result, 1);
  assert.equal(metrics.expected_via_hop_only, 0);
});

test("the Rung is embedding when any call's was; the hop counts only when it ran and returned a neighbour", () => {
  const metrics = retrievalMetrics(
    [],
    [
      search({ rung: "lexical" }),
      search({ rung: "embedding", hopRan: true }),
      search({ neighbours: ["entities/ridgeline-tool-supply.md"] }),
    ]
  );
  assert.equal(metrics.rung_embedding, 1);
  assert.equal(metrics.hop_added, 0);
});

test("only search_wiki outputs count; a call that never resolved searched but returned nothing", () => {
  const metrics = retrievalMetrics(CASH, [
    {
      name: "read_page",
      output: { matches: ["summaries/2026-08-22-receipt-dockside-deli.md"] },
    },
    { name: "search_wiki", output: undefined },
  ]);
  assert.equal(metrics.searched, 1);
  assert.equal(metrics.expected_in_result, 0);
  assert.equal(retrievalMetrics([], [read]).searched, 0);
});

test("a Source id names its summary Page exactly, never another Page whose path contains it", () => {
  const reminder = "obligations/2026-08-22-receipt-dockside-deli-reminder.md";
  const metrics = retrievalMetrics(
    ["2026-08-22-receipt-dockside-deli"],
    [search({ matches: [reminder] })]
  );
  assert.equal(metrics.expected_in_result, 0);
  assert.equal(metrics.expected_via_hop_only, 0);
});

test("a summary reached only as a neighbour is via the hop only, even when a Page containing its id was a Match", () => {
  const metrics = retrievalMetrics(
    ["2026-08-22-receipt-dockside-deli"],
    [
      search({
        hopRan: true,
        matches: ["obligations/2026-08-22-receipt-dockside-deli-reminder.md"],
        neighbours: ["summaries/2026-08-22-receipt-dockside-deli.md"],
      }),
    ]
  );
  assert.equal(metrics.expected_in_result, 1);
  assert.equal(metrics.expected_via_hop_only, 1);
});

test("a Source id in any case resolves to its summary; a Page path still matches as a substring", () => {
  const metrics = retrievalMetrics(
    [["2026-08-22-RECEIPT-DOCKSIDE-DELI", "nowhere.md"], "entities/dockside"],
    [
      search({
        matches: [
          "summaries/2026-08-22-receipt-dockside-deli.md",
          "entities/dockside-deli.md",
        ],
      }),
    ]
  );
  assert.equal(metrics.expected_in_result, 1);
});
