import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWiki } from "../index";

const fm = (fields: string) =>
  `---\n${fields}\ncreated: 2026-10-17\nupdated: 2026-10-17\nstatus: active\nflags: []\n---\n`;

const SCHEMA = `${fm("title: Wiki schema\nkind: schema\nsources: []")}\n# Wiki schema\n\n- **missed**: status active and due before the Demo Date\n`;
const LOG = `${fm("title: Log\nkind: log\nsources: []")}\n# Log\n\n- 2026-10-17 INGEST [2025-04-01-lease-harborview]: created the summary.\n- 2026-10-17 LINT: 1 missed.\n`;
const PROFILE = `${fm("title: Northwind Repair LLC\nkind: profile\nsources: [2025-04-01-lease-harborview]")}
# Northwind Repair LLC

## Addresses

- **Premises**: 1480 Harbor Ave, Suite 210 (src: 2025-04-01-lease-harborview)
- **State of formation**: not in the wiki
`;
const OBLIGATION = `${fm("title: Lease notice\nkind: obligation\nobligation: lease-notice\ndue: 2026-12-31\ncounterparty: harborview-properties\nrecurs: none\nsources: [2025-04-01-lease-harborview]")}
# Lease notice

- **Due**: 2026-12-31 (src: 2025-04-01-lease-harborview)
- **Kind**: lease-notice, one-off
- **Counterparty**: [Harborview Properties LLC](../entities/harborview-properties.md)
- **Status**: active

## History

- 2026-10-17 created from the lease summary
`;
const SUMMARY = `${fm("title: Lease\nkind: summary\nsources: [2025-04-01-lease-harborview]")}
# Lease

- Rent $1,450/mo (src: 2025-04-01-lease-harborview)
`;
const INDEX = `${fm("title: Index\nkind: index\nsources: []")}
# Index

## Profile

- [Northwind Repair LLC](profile.md): the Business.

## Obligations

- 2026-12-31 lease-notice (active): [Lease notice](obligations/2026-12-31-lease-notice-harborview.md): notice date.

## Sources

- 2025-04-01 lease: [Lease](summaries/2025-04-01-lease-harborview.md): the lease.
`;

const SUMMARY_PATH = "summaries/2025-04-01-lease-harborview.md";
const OBLIGATION_PATH = "obligations/2026-12-31-lease-notice-harborview.md";

const wiki = (changes: Record<string, string | null> = {}) => {
  const pages = new Map<string, string>(
    Object.entries({
      "SCHEMA.md": SCHEMA,
      "index.md": INDEX,
      "log.md": LOG,
      "profile.md": PROFILE,
      [OBLIGATION_PATH]: OBLIGATION,
      [SUMMARY_PATH]: SUMMARY,
    })
  );
  for (const [path, body] of Object.entries(changes))
    if (body === null) pages.delete(path);
    else pages.set(path, body);
  return pages;
};

const fails = (pages: Map<string, string>, pattern: RegExp) => {
  const problems = checkWiki(pages);
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `expected a problem matching ${pattern}, got:\n${problems.join("\n")}`
  );
};

test("a consistent wiki has no problems", () => {
  assert.deepEqual(checkWiki(wiki()), []);
});

test("reports a Page whose frontmatter does not parse", () => {
  fails(
    wiki({ [SUMMARY_PATH]: "# Lease\n" }),
    /summaries\/2025-04-01-lease-harborview\.md.*frontmatter/
  );
});

test("reports Allocations that do not sum to the amount", () => {
  const record = SUMMARY.replace(
    "flags: []\n",
    "flags: []\nexpense:\n  vendor: v\n  date: 2026-09-01\n  amount: 20.00\n  currency: USD\n  document: null\n  allocations:\n    - { category: supplies, amount: 15.00 }\n  payment:\n    status: paid\n    due: null\n    evidence: []\n"
  );
  fails(wiki({ [SUMMARY_PATH]: record }), /sum to 15\.00/);
});

test("reports a Profile fact line without a Citation", () => {
  const uncited = PROFILE.replace(" (src: 2025-04-01-lease-harborview)", "");
  fails(wiki({ "profile.md": uncited }), /profile\.md.*Citation.*Premises/);
});

test("reports an Obligation fact line without a Citation", () => {
  const uncited = OBLIGATION.replace(" (src: 2025-04-01-lease-harborview)", "");
  fails(
    wiki({ [OBLIGATION_PATH]: uncited }),
    /obligations\/2026-12-31-lease-notice-harborview\.md.*Citation.*Due/
  );
});

test("reports stored urgency in a Page body", () => {
  for (const phrase of ["missed", "due soon", "days out"])
    fails(
      wiki({ [SUMMARY_PATH]: `${SUMMARY}- Notice: ${phrase}\n` }),
      new RegExp(`summaries/2025-04-01-lease-harborview\\.md.*"${phrase}"`)
    );
});

test("reports a Page missing from the Index", () => {
  fails(
    wiki({
      "entities/harborview-properties.md": `${fm("title: Harborview\nkind: entity\nentity: landlord\nsources: [2025-04-01-lease-harborview]")}\n# Harborview\n`,
    }),
    /entities\/harborview-properties\.md.*not listed in the Index/
  );
});

test("reports an Index line pointing at no Page", () => {
  fails(
    wiki({ [OBLIGATION_PATH]: null }),
    /Index links obligations\/2026-12-31-lease-notice-harborview\.md/
  );
});

test("reports a summary with no INGEST line and an INGEST line with no summary", () => {
  fails(
    wiki({ "log.md": LOG.replace(/^- .*INGEST.*\n/m, "") }),
    /2025-04-01-lease-harborview.*no INGEST line/
  );
  fails(
    wiki({ [SUMMARY_PATH]: null }),
    /INGEST \[2025-04-01-lease-harborview\].*no summary/
  );
});

test("reports an Index section that appears twice or out of order", () => {
  fails(
    wiki({ "index.md": `${INDEX}\n## Obligations\n` }),
    /Index has the section "Obligations" more than once/
  );
  const swapped = INDEX.replace("## Profile", "## Sources-tmp")
    .replace("## Sources\n", "## Profile\n")
    .replace("## Sources-tmp", "## Sources");
  fails(wiki({ "index.md": swapped }), /Index sections must be in the order/);
});

test("reports a Page listed twice in the Index", () => {
  fails(
    wiki({
      "index.md": `${INDEX}- 2025-04-01 lease: [Lease](summaries/2025-04-01-lease-harborview.md): again.\n`,
    }),
    /Index lists summaries\/2025-04-01-lease-harborview\.md 2 times/
  );
});

test("reports a flagged Page with no FLAG line naming it", () => {
  const flagged = SUMMARY.replace("flags: []", "flags: [suspicious-content]");
  fails(
    wiki({ [SUMMARY_PATH]: flagged }),
    /summaries\/2025-04-01-lease-harborview\.md is flagged suspicious-content but no FLAG \[suspicious-content\] line names it/
  );
  const logged = `${LOG}- 2026-10-17 FLAG [suspicious-content]: ${SUMMARY_PATH} quotes an instruction.\n`;
  assert.deepEqual(
    checkWiki(wiki({ [SUMMARY_PATH]: flagged, "log.md": logged })),
    []
  );
});

test("reports a Source line in the Index that does not start with the document date", () => {
  fails(
    wiki({
      "index.md": INDEX.replace("- 2025-04-01 lease: [Lease]", "- [Lease]"),
    }),
    /Index line for summaries\/2025-04-01-lease-harborview\.md must start with its date/
  );
});
