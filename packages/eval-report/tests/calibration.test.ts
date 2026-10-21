import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadYaml } from "eve/evals/loaders";
import { calibrationYaml, type CalibrationRow } from "../calibration";

type Doc = {
  run: { id: string; label: string };
  entries: {
    question: string;
    answer: string | null;
    earlierTurns?: string[];
    missing?: string;
    pages: Record<string, string>;
  }[];
};

async function parse(yaml: string): Promise<Doc> {
  const file = join(await mkdtemp(join(tmpdir(), "calibration-")), "c.yaml");
  await writeFile(file, yaml);
  return (await loadYaml(file)) as Doc;
}

const PROFILE =
  "---\nkind: profile\n---\n# Northwind Repair LLC\n\n- EIN: 88-1234567 (src: 2024-10-21-ein-letter)\n";
const INDEX = "# Index\n\n- [Northwind Repair LLC](profile.md)\n";
const LEDGER = "---\nkind: ledger\n---\n# Supplies\n";
const wiki = new Map([
  ["index.md", INDEX],
  ["profile.md", PROFILE],
  ["expenses/supplies.md", LEDGER],
]);

const ein: CalibrationRow = {
  evalId: "query/questions/0000",
  caseId: "query-ein",
  prompts: ["What is our EIN?"],
  cites: ["profile.md"],
};

const run = { runId: "2026-10-19T08-00-00", label: "before", seed: "full" };

test("one entry per calibration row: the question, Clerk's answer, the cited Page text, and blank judgments", async () => {
  const answer =
    "88-1234567 (src: 2024-10-21-ein-letter) — [Northwind Repair LLC](/wiki/profile.md).";
  const doc = await parse(
    calibrationYaml({
      ...run,
      rows: [ein],
      results: [
        {
          id: "query/questions/0000",
          output: answer,
          traceContexts: [{ traceId: "abc123", sessionId: "wrun_1" }],
        },
      ],
      wiki,
    })
  );

  assert.equal(doc.run.id, "2026-10-19T08-00-00");
  assert.equal(doc.run.label, "before");
  assert.deepEqual(doc.entries, [
    {
      caseId: "query-ein",
      evalId: "query/questions/0000",
      traceId: "abc123",
      question: "What is our EIN?",
      answer,
      pages: { "index.md": INDEX, "profile.md": PROFILE },
      faithful: null,
      cited: null,
    },
  ]);
});

test("answers and Page text come back byte for byte, whatever their whitespace", async () => {
  const awkward = [
    "  indented first line\nsecond: with a colon # and a hash\n",
    "no trailing newline\n- a list item",
    "trailing blank lines\n\n\n",
    "trailing spaces   \n\n  \"quoted\" and 'single'\n",
    "one line: plain",
    "carriage\r\nreturn",
  ];
  for (const text of awkward) {
    const doc = await parse(
      calibrationYaml({
        ...run,
        rows: [ein],
        results: [{ id: ein.evalId, output: text }],
        wiki: new Map([["index.md", text]]),
      })
    );
    assert.equal(doc.entries[0].answer, text);
    assert.equal(doc.entries[0].pages["index.md"], text);
  }
});

test("a multi-turn row keeps its earlier turns; a row the run did not answer is marked missing", async () => {
  const landlord: CalibrationRow = {
    evalId: "query/questions/0007",
    caseId: "query-landlord-lease-notice",
    prompts: ["Who is our landlord?", "When is the lease notice due?"],
    cites: ["obligations/"],
  };
  const doc = await parse(
    calibrationYaml({ ...run, rows: [landlord, ein], results: [], wiki })
  );
  assert.deepEqual(doc.entries[0].earlierTurns, ["Who is our landlord?"]);
  assert.equal(doc.entries[0].question, "When is the lease notice due?");
  assert.equal(doc.entries[1].answer, null);
  assert.match(doc.entries[1]!.missing ?? "", /no results/);
  assert.deepEqual(doc.entries[1].pages, {});
});
