import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createWikiStore, type WikiStore } from "../../../packages/wiki-store";
import appendLog from "../../tools/append_log";

// The one INGEST line closes an Ingest, so append_log refuses it until the
// Schema's bookkeeping is done: every Page the Source touched is on the Index,
// and a duplicate is listed on its Record, not counted again.

const INVOICE = "2026-09-12-invoice-cascade-parts-4471";
const COPY = "2026-09-12-invoice-cascade-parts-4471-2";
const RECORD = `summaries/${INVOICE}.md`;
const OBLIGATION = "obligations/2026-10-12-pay-invoice-cascade-4471.md";

const page = (kind: string, sources: string, extra = "", body = "") => `---
title: A ${kind}
kind: ${kind}
sources: [${sources}]
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
${extra}---

# A ${kind}
${body}`;

const record = page(
  "summary",
  INVOICE,
  `expense:
  vendor: cascade-appliance-parts
  date: 2026-09-12
  amount: 212.48
  currency: USD
  document: "4471"
  allocations:
    - { category: supplies, amount: 212.48 }
  payment:
    status: unknown
    due: 2026-10-12
    evidence: []
`
);
const obligation = page(
  "obligation",
  INVOICE,
  "obligation: other\ndue: 2026-10-12\ncounterparty: cascade-appliance-parts\nrecurs: none\n"
);
const copy = page(
  "summary",
  COPY,
  "",
  `\nDuplicate of [invoice 4471](${RECORD}) (src: ${COPY}).\n`
);
const ledger = (rows: string) =>
  page("ledger", INVOICE, "category: supplies\n", rows);

const indexWith = (lines: string) => `---
title: Index
kind: index
sources: []
created: 2026-10-17
updated: 2026-10-17
status: active
flags: []
---

# Index

${lines}
`;
const fullIndex = [
  `- 2026-10-12 other (active): [Pay invoice 4471](${OBLIGATION}): $212.48.`,
  "- [supplies](expenses/supplies.md): 1 allocation.",
  `- 2026-09-12 invoice: [Cascade invoice 4471](${RECORD}): $212.48.`,
].join("\n");

let root = "";
let store: WikiStore;
const saved = { ...process.env };
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ingest-line-test-"));
  process.env.WIKI_STORE_DIR = root;
  process.env.WIKI_NAMESPACE = "t";
  mkdirSync(join(root, "t", "sources"), { recursive: true });
  for (const id of [INVOICE, COPY])
    writeFileSync(join(root, "t", "sources", `${id}.txt`), "INVOICE 4471\n");
  store = createWikiStore({ namespace: "t" });
  await store.write("log.md", "# Log\n", { etag: null });
  await store.write(RECORD, record, { etag: null });
  await store.write(OBLIGATION, obligation, { etag: null });
  await store.write(
    "expenses/supplies.md",
    ledger(`\n- 2026-09-12 | [invoice 4471](../${RECORD}) | $212.48\n`),
    { etag: null }
  );
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

async function write(path: string, body: string) {
  const current = await store.read(path);
  await store.write(path, body, { etag: current?.etag ?? null });
}

async function ingest(subject: string): Promise<string> {
  const tool = appendLog as unknown as {
    execute: (input: unknown, ctx: unknown) => Promise<string>;
  };
  try {
    return await tool.execute(
      { type: "INGEST", subject, detail: "created the Pages" },
      {}
    );
  } catch (error) {
    return `refused: ${(error as Error).message}`;
  }
}

test("the INGEST line is written once every Page the Source touched is on the Index", async () => {
  await write("index.md", indexWith(fullIndex));
  assert.match(
    await ingest(INVOICE),
    /^Logged: .* INGEST \[2026-09-12-invoice-cascade-parts-4471\]/
  );
});

test("the INGEST line waits for a new Obligation's Index line", async () => {
  await write("index.md", indexWith(fullIndex.split("\n").slice(1).join("\n")));
  const result = await ingest(INVOICE);
  assert.match(result, /^refused: /);
  assert.match(result, new RegExp(OBLIGATION));
  assert.equal((await store.read("log.md"))?.body, "# Log\n");
});

test("an Obligation's Index line starts with its due date, kind, and status", async () => {
  await write(
    "index.md",
    indexWith(fullIndex.replace("- 2026-10-12 other (active): ", "- "))
  );
  const result = await ingest(INVOICE);
  assert.match(result, /^refused: /);
  assert.match(result, /2026-10-12 other \(active\)/);
});

test("a duplicate's INGEST line waits until its Record lists it under Also seen in", async () => {
  await write(`summaries/${COPY}.md`, copy);
  const index = `${fullIndex}\n- 2026-09-12 invoice copy: [copy](summaries/${COPY}.md): duplicate.`;
  await write("index.md", indexWith(index));
  const refused = await ingest(COPY);
  assert.match(refused, /^refused: /);
  assert.match(refused, /Also seen in/);

  await write(
    RECORD,
    `${record}\n## Also seen in\n\n- ${COPY}: duplicate copy (src: ${COPY})\n`
  );
  assert.match(await ingest(COPY), /^Logged: /);
});

test("a duplicate adds no Ledger row", async () => {
  await write(`summaries/${COPY}.md`, copy);
  await write(
    RECORD,
    `${record}\n## Also seen in\n\n- ${COPY}: duplicate copy (src: ${COPY})\n`
  );
  await write(
    "expenses/supplies.md",
    ledger(
      `\n- 2026-09-12 | [invoice 4471](../${RECORD}) | $212.48\n- 2026-09-12 | [copy](../summaries/${COPY}.md) | $212.48\n`
    )
  );
  const index = `${fullIndex}\n- 2026-09-12 invoice copy: [copy](summaries/${COPY}.md): duplicate.`;
  await write("index.md", indexWith(index));
  const result = await ingest(COPY);
  assert.match(result, /^refused: /);
  assert.match(result, /expenses\/supplies\.md/);
});

test("the INGEST line waits until a closed Obligation's Index line shows its new status", async () => {
  await write(
    OBLIGATION,
    obligation.replace("status: active", "status: done\ndone_on: 2026-10-14")
  );
  await write("index.md", indexWith(fullIndex));
  const refused = await ingest(INVOICE);
  assert.match(refused, /^refused: /);
  assert.match(refused, /2026-10-12 other \(done\)/);

  await write(
    "index.md",
    indexWith(fullIndex.replace("other (active)", "other (done)"))
  );
  assert.match(await ingest(INVOICE), /^Logged: /);
});

test("the INGEST line waits for a FLAG line naming each flagged Page the Source cites", async () => {
  await write(
    RECORD,
    record.replace("flags: []", "flags: [suspicious-content]")
  );
  await write("index.md", indexWith(fullIndex));
  const refused = await ingest(INVOICE);
  assert.match(refused, /^refused: /);
  assert.match(refused, /FLAG \[suspicious-content\]/);

  const log = await store.read("log.md");
  await store.write(
    "log.md",
    `${log!.body}- 2026-10-17 FLAG [suspicious-content]: ${RECORD} quotes an instruction.\n`,
    { etag: log!.etag }
  );
  assert.match(await ingest(INVOICE), /^Logged: /);
});

test("an unpaid invoice's INGEST line waits for its payment Obligation", async () => {
  rmSync(join(root, "t", OBLIGATION));
  await write("index.md", indexWith(fullIndex.split("\n").slice(1).join("\n")));
  const refused = await ingest(INVOICE);
  assert.match(refused, /^refused: /);
  assert.match(refused, /payment Obligation/);
  assert.match(refused, /obligations\/2026-10-12-pay-invoice-/);
});

test("a Source that states an expiry waits for an Obligation due that day", async () => {
  const CERT = "2025-11-15-insurance-cert-meridian";
  const SUMMARY = `summaries/${CERT}.md`;
  const RENEWAL = "obligations/2026-11-15-insurance-renewal-meridian.md";
  writeFileSync(join(root, "t", "sources", `${CERT}.txt`), "CERTIFICATE\n");
  await write(
    SUMMARY,
    page(
      "summary",
      CERT,
      "",
      `\n- **Policy expiration**: 2026-11-15 (src: ${CERT})\n\nNotice before the expiration date thereof (src: ${CERT}).\n`
    )
  );
  const certLine = `- 2025-11-15 certificate: [Insurance certificate](${SUMMARY}): policy GL-2025-77410.`;
  await write("index.md", indexWith(`${fullIndex}\n${certLine}`));
  const refused = await ingest(CERT);
  assert.match(refused, /^refused: /);
  assert.match(refused, /expires 2026-11-15/);

  await write(
    RENEWAL,
    page(
      "obligation",
      CERT,
      "obligation: insurance-renewal\ndue: 2026-11-15\ncounterparty: meridian\nrecurs: none\n"
    )
  );
  await write(
    "index.md",
    indexWith(
      `${fullIndex}\n${certLine}\n- 2026-11-15 insurance-renewal (active): [Renew policy](${RENEWAL})`
    )
  );
  assert.match(await ingest(CERT), /^Logged: /);
});
