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

test("a lease's end date is tracked by the notice Obligation counted from it, not a second one", async () => {
  const LEASE = "2025-04-01-lease-harborview";
  const SUMMARY = `summaries/${LEASE}.md`;
  const NOTICE = "obligations/2026-12-31-lease-notice-harborview.md";
  writeFileSync(join(root, "t", "sources", `${LEASE}.md`), "LEASE\n");
  await write(
    SUMMARY,
    page("summary", LEASE, "", `\n- Expiration: 2027-03-31 (src: ${LEASE})\n`)
  );
  await write(
    NOTICE,
    page(
      "obligation",
      LEASE,
      "obligation: lease-notice\ndue: 2026-12-31\ncounterparty: harborview-properties\nrecurs: none\n",
      `\n- **Deadline**: 90 days before the term ends on 2027-03-31 (src: ${LEASE})\n`
    )
  );
  await write(
    "index.md",
    indexWith(
      `${fullIndex}\n- 2026-12-31 lease-notice (active): [Lease notice](${NOTICE})\n- 2025-04-01 lease: [Lease](${SUMMARY}): Suite 210.`
    )
  );
  assert.match(await ingest(LEASE), /^Logged: /);
});

test("a Source that states a filing due date waits for an Obligation due that day", async () => {
  const REG = "2024-11-04-sales-tax-registration";
  const SUMMARY = `summaries/${REG}.md`;
  const RETURN = "obligations/2027-01-31-tax-filing-sales-tax-return.md";
  writeFileSync(join(root, "t", "sources", `${REG}.md`), "REGISTRATION\n");
  await write(
    SUMMARY,
    page(
      "summary",
      REG,
      "",
      `\n- **Filing frequency**: annual; returns due January 31. Next return due 2027-01-31 (src: ${REG})\n`
    )
  );
  const regLine = `- 2024-11-04 registration: [Sales-tax registration](${SUMMARY}): ST-24-558201.`;
  await write("index.md", indexWith(`${fullIndex}\n${regLine}`));
  const refused = await ingest(REG);
  assert.match(refused, /^refused: /);
  assert.match(refused, /due 2027-01-31/);
  assert.match(refused, /tax-filing/);

  await write(
    RETURN,
    page(
      "obligation",
      REG,
      "obligation: tax-filing\ndue: 2027-01-31\ncounterparty: null\nrecurs: yearly\n"
    )
  );
  await write(
    "index.md",
    indexWith(
      `${fullIndex}\n${regLine}\n- 2027-01-31 tax-filing (active): [File the sales-tax return](${RETURN})`
    )
  );
  assert.match(await ingest(REG), /^Logged: /);
});

test("a Source with no Record waits until the Profile cites it or its summary says it adds no Business facts", async () => {
  const LEASE = "2025-04-01-lease-harborview";
  const SUMMARY = `summaries/${LEASE}.md`;
  writeFileSync(join(root, "t", "sources", `${LEASE}.md`), "LEASE\n");
  const profile = (facts: string) =>
    page("profile", facts ? LEASE : "", "", `\n## Premises lease\n${facts}`);
  await write("profile.md", profile(""));
  await write(
    SUMMARY,
    page("summary", LEASE, "", `\n- Rent $1,450 (src: ${LEASE})\n`)
  );
  const lines = `${fullIndex}\n- [Northwind Repair LLC](profile.md): the Business.\n- 2025-04-01 lease: [Lease](${SUMMARY}): Suite 210.`;
  await write("index.md", indexWith(lines));
  const refused = await ingest(LEASE);
  assert.match(refused, /^refused: /);
  assert.match(refused, /Profile/);
  assert.match(refused, /Business facts\*\*: none new/);

  await write(
    "profile.md",
    profile(`\n- **Landlord**: Harborview Properties LLC (src: ${LEASE})\n`)
  );
  assert.match(await ingest(LEASE), /^Logged: /);
});

test("a Source whose summary says it adds no Business facts needs no Profile Citation", async () => {
  await write("profile.md", page("profile", "", "", "\n## Identity\n"));
  await write(
    "index.md",
    indexWith(
      `${fullIndex}\n- [Northwind Repair LLC](profile.md): the Business.\n- 2026-09-12 invoice: [Copy](summaries/${COPY}.md): PAID copy.`
    )
  );
  await write(
    `summaries/${COPY}.md`,
    copy.replace(
      "Duplicate of",
      "- **Business facts**: none new\n\nDuplicate of"
    )
  );
  await write(
    RECORD,
    `${record}\n## Also seen in\n\n- ${COPY}: duplicate (src: ${COPY})\n`
  );
  assert.match(await ingest(COPY), /^Logged: /);
});

test("a Citation's Source id date is not a stated due date or expiry", async () => {
  const REG = "2024-11-04-sales-tax-registration";
  const SUMMARY = `summaries/${REG}.md`;
  writeFileSync(join(root, "t", "sources", `${REG}.md`), "REGISTRATION\n");
  await write(
    SUMMARY,
    page(
      "summary",
      REG,
      "",
      `\n- **Filing frequency**: annual; returns due January 31 following each calendar year (src: ${REG})\n- **Expires**: see the registration terms (src: ${REG})\n`
    )
  );
  await write(
    "index.md",
    indexWith(
      `${fullIndex}\n- 2024-11-04 registration: [Registration](${SUMMARY}): ST-24-558201.`
    )
  );
  assert.match(await ingest(REG), /^Logged: /);
});

// "Ingest everything new" is driven by tool output, not by Clerk remembering
// the loop after an Approval resumes the turn: each INGEST line's result names
// the Inbox Sources still waiting, or says the Inbox is empty.

test("the INGEST result names the Inbox Sources still to Ingest, next first", async () => {
  await write("index.md", indexWith(fullIndex));
  const result = await ingest(INVOICE);
  assert.match(result, /^Logged: /);
  assert.match(
    result,
    /Inbox still holds 1 Source: 2026-09-12-invoice-cascade-parts-4471-2\./
  );
  assert.match(
    result,
    /read_source\("2026-09-12-invoice-cascade-parts-4471-2"\) next/
  );
});

test("the INGEST result says the Inbox is empty once every Source has a summary", async () => {
  await write(`summaries/${COPY}.md`, copy);
  await write(
    RECORD,
    `${record}\n## Also seen in\n\n- ${COPY}: duplicate copy (src: ${COPY})\n`
  );
  const index = `${fullIndex}\n- 2026-09-12 invoice copy: [copy](summaries/${COPY}.md): duplicate.`;
  await write("index.md", indexWith(index));
  const result = await ingest(COPY);
  assert.match(result, /^Logged: /);
  assert.match(result, /The Inbox is empty\./);
});

// A payment proposal written only as prose parks on nothing: the Owner sees
// what reads as an Approval request with no Approval behind it. A Source a
// Record lists as payment evidence, while the Record is not paid, is closed
// only after this turn's change_fact proposed that Record's payment.

const payingCopy = async () => {
  await write(
    `summaries/${COPY}.md`,
    copy.replace(
      "Duplicate of",
      "- **Business facts**: none new\n\nPAID duplicate of"
    )
  );
  await write(
    RECORD,
    `${record}\n## Also seen in\n\n- ${COPY}: payment evidence, pending Approval (src: ${COPY})\n`
  );
  await write(
    "index.md",
    indexWith(
      `${fullIndex}\n- 2026-09-12 invoice copy: [copy](summaries/${COPY}.md): PAID copy.`
    )
  );
};

async function ingestWith(
  subject: string,
  messages: unknown[]
): Promise<string> {
  const tool = appendLog as unknown as {
    execute: (input: unknown, ctx: unknown) => Promise<string>;
  };
  try {
    return await tool.execute(
      { type: "INGEST", subject, detail: "created the Pages" },
      { messages }
    );
  } catch (error) {
    return `refused: ${(error as Error).message}`;
  }
}

const ownerAsks = {
  role: "user",
  content: [{ type: "text", text: "Ingest everything new." }],
};

test("payment evidence for an unpaid Record waits for this turn's change_fact", async () => {
  await payingCopy();
  const refused = await ingestWith(COPY, [ownerAsks]);
  assert.match(refused, /^refused: /);
  assert.match(refused, /change_fact/);
  assert.match(refused, new RegExp(RECORD));
  assert.equal((await store.read("log.md"))?.body, "# Log\n");
});

test("payment evidence closes once change_fact proposed the Record's payment this turn", async () => {
  await payingCopy();
  const proposal = {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolName: "change_fact",
        toolCallId: "c1",
        input: {
          changes: [
            {
              page: RECORD,
              old_value: "status: unknown",
              new_value: "status: paid",
            },
          ],
          source: COPY,
          reason: "PAID copy.",
        },
      },
    ],
  };
  assert.match(await ingestWith(COPY, [ownerAsks, proposal]), /^Logged: /);
});
