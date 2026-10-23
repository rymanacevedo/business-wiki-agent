import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenise } from "../lexical";

// The tokeniser table from research #45 (docs/research/lexical-ranking.md on
// research/lexical-ranking, section 2.2), copied as the expected values.
// Compared as bags: BM25 ignores order, and the table lists the `md` row's
// tokens in a different order than the research's own appendix code emits.
const TABLE: [string, string[]][] = [
  ["EIN: 88-1234567", ["ein", "88-1234567", "88", "1234567"]],
  ["$212.48", ["212.48"]],
  ["2026-09-12", ["2026-09-12", "2026", "09", "12", "2026-09"]],
  ["Policy GL-2025-77410", ["policy", "gl-2025-77410", "gl", "2025", "77410"]],
  [
    "harbor-hardware-supply",
    ["harbor-hardware-supply", "harbor", "hardware", "supply"],
  ],
  [
    "(src: 2026-09-12-invoice-cascade-parts-4471)",
    [
      "2026-09-12-invoice-cascade-parts-4471",
      "2026",
      "09",
      "12",
      "invoice",
      "cascade",
      "parts",
      "4471",
      "2026-09",
    ],
  ],
  ["Invoice #4471", ["invoice", "4471"]],
  ["***-**-6789", ["6789"]],
  ["****6615", ["6615"]],
  ["annual premium $1,284.00", ["annual", "premium", "1284.00"]],
  [
    "limits each occurrence $1,000,000",
    ["limits", "each", "occurrence", "1000000"],
  ],
  ["Tax 8.0% 15.64", ["tax", "8.0", "15.64"]],
  [
    "[receipt](../summaries/2026-08-03-receipt-harbor-hardware.md)",
    [
      "receipt",
      "summaries",
      "2026-08-03-receipt-harbor-hardware",
      "2026",
      "08",
      "03",
      "receipt",
      "harbor",
      "hardware",
      "md",
      "2026-08",
    ],
  ],
  [
    "ST-24-558201; effective 2024-11-04",
    [
      "st-24-558201",
      "st",
      "24",
      "558201",
      "effective",
      "2024-11-04",
      "2024",
      "11",
      "04",
      "2024-11",
    ],
  ],
  [
    "Permit No. BP-2025-0918",
    ["permit", "no", "bp-2025-0918", "bp", "2025", "0918"],
  ],
  [
    "Compressor start relay (univ.) — 18.75 each",
    ["compressor", "start", "relay", "univ", "18.75", "each"],
  ],
  ["Harbor Ave Ste 210, Portside", ["harbor", "ave", "ste", "210", "portside"]],
  [
    "Net 30; Due: 2026-10-12",
    ["net", "30", "due", "2026-10-12", "2026", "10", "12", "2026-10"],
  ],
];

for (const [input, tokens] of TABLE)
  test(`tokenises ${input}`, () => {
    assert.deepEqual(tokenise(input).sort(), [...tokens].sort());
  });

test("drops stop words, src and one-character tokens; no stemmer", () => {
  assert.deepEqual(tokenise("What is the src of a renewal?"), ["renewal"]);
});

test("a Query turns Month YYYY into YYYY-MM; a Page does not", () => {
  assert.deepEqual(
    tokenise("How much did we spend on supplies in September 2026?", {
      query: true,
    }),
    ["much", "spend", "supplies", "2026-09", "2026", "09"]
  );
  assert.deepEqual(tokenise("September 2026"), ["september", "2026"]);
});
