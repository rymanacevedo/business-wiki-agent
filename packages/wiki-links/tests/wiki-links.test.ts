import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { createWikiStore } from "../../wiki-store";
import { linkPage } from "../index";
import { openWikiPage } from "../open";

const OBLIGATION = `---
title: Pay Cascade Appliance Parts invoice 4471 due 2026-10-12
kind: obligation
sources: [2026-09-12-invoice-cascade-parts-4471]
---

# Pay invoice 4471

- **Due**: 2026-10-12 (src: 2026-09-12-invoice-cascade-parts-4471)
- **Record**: [invoice](../summaries/2026-09-12-invoice-cascade-parts-4471.md)
- **Vendor**: [Cascade Appliance Parts](../entities/cascade-appliance-parts.md)
`;

test("a Page's relative links and Citations become wiki browser links", () => {
  const { body } = linkPage(
    OBLIGATION,
    "obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md"
  );
  assert.equal(
    body,
    `
# Pay invoice 4471

- **Due**: 2026-10-12 ([src: 2026-09-12-invoice-cascade-parts-4471](/wiki/sources/2026-09-12-invoice-cascade-parts-4471))
- **Record**: [invoice](/wiki/summaries/2026-09-12-invoice-cascade-parts-4471.md)
- **Vendor**: [Cascade Appliance Parts](/wiki/entities/cascade-appliance-parts.md)
`
  );
});

test("the frontmatter is split off the body and kept verbatim", () => {
  const { frontmatter } = linkPage(OBLIGATION, "obligations/x.md");
  assert.equal(
    frontmatter,
    "title: Pay Cascade Appliance Parts invoice 4471 due 2026-10-12\nkind: obligation\nsources: [2026-09-12-invoice-cascade-parts-4471]"
  );
  assert.equal(linkPage("# Index\n", "index.md").frontmatter, null);
});

test("links at the root, in chat form, external, or escaping the Wiki are left alone", () => {
  const markdown = [
    "[Profile](profile.md)",
    "[Profile](/wiki/profile.md)",
    "[site](https://example.com/a.md)",
    "[mail](mailto:owner@example.com)",
    "[top](#index)",
    "[out](../../etc/passwd)",
  ].join("\n");
  assert.equal(
    linkPage(markdown, "index.md").body,
    [
      "[Profile](/wiki/profile.md)",
      "[Profile](/wiki/profile.md)",
      "[site](https://example.com/a.md)",
      "[mail](mailto:owner@example.com)",
      "[top](#index)",
      "[out](../../etc/passwd)",
    ].join("\n")
  );
});

test("a chat answer's Citations link to their Sources", () => {
  assert.equal(
    linkPage(
      "EIN 12-3456789 (src: 2024-10-21-ein-letter), see [Profile](/wiki/profile.md).",
      null
    ).body,
    "EIN 12-3456789 ([src: 2024-10-21-ein-letter](/wiki/sources/2024-10-21-ein-letter)), see [Profile](/wiki/profile.md)."
  );
});

const root = mkdtempSync(join(tmpdir(), "wiki-links-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

async function seeded() {
  const env = { WIKI_STORE_DIR: root };
  const files: Record<string, string> = {
    "demo/index.md": "# Index\n",
    "demo/entities/harborview.md": "# Harborview\n",
    "demo/sources/2024-10-21-ein-letter.md": "EIN letter\n",
    "demo/sources/2026-10-03-receipt-paper-trail-office.txt": "receipt\n",
  };
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return createWikiStore({ namespace: "demo", env });
}

test("the wiki browser opens the Index at its root and any Page by path", async () => {
  const store = await seeded();
  assert.deepEqual(await openWikiPage(store, []), {
    path: "index.md",
    body: "# Index\n",
  });
  assert.deepEqual(await openWikiPage(store, ["entities", "harborview.md"]), {
    path: "entities/harborview.md",
    body: "# Harborview\n",
  });
});

test("a Citation's Source opens by id whatever its extension", async () => {
  const store = await seeded();
  assert.equal(
    (await openWikiPage(store, ["sources", "2024-10-21-ein-letter"]))?.path,
    "sources/2024-10-21-ein-letter.md"
  );
  assert.equal(
    (
      await openWikiPage(store, [
        "sources",
        "2026-10-03-receipt-paper-trail-office",
      ])
    )?.path,
    "sources/2026-10-03-receipt-paper-trail-office.txt"
  );
});

const corpusSource = (name: string) =>
  readFileSync(join(__dirname, "../../../corpus/sources", name), "utf8");

test("a Source opens masked as Clerk saw it: no full SSN, account, or routing number", async () => {
  const store = await seeded();
  const w9 = corpusSource("2026-02-20-w9-northwind.md");
  const statement = corpusSource("2026-09-30-bank-statement-tidewater.txt");
  await writeFile(join(root, "demo/sources/2026-02-20-w9-northwind.md"), w9);
  await writeFile(
    join(root, "demo/sources/2026-09-30-bank-statement-tidewater.txt"),
    statement
  );

  const ssn = /Social security number:\s*(\d{3}-\d{2}-(\d{4}))/.exec(w9)!;
  const openedW9 = await openWikiPage(store, [
    "sources",
    "2026-02-20-w9-northwind",
  ]);
  assert.ok(!openedW9!.body.includes(ssn[1]), "the full SSN is shown");
  assert.ok(openedW9!.body.includes(`***-**-${ssn[2]}`));

  const account = /Account number:\s*(\d+)/.exec(statement)![1];
  const routing = /Routing number:\s*(\d+)/.exec(statement)![1];
  const openedStatement = await openWikiPage(store, [
    "sources",
    "2026-09-30-bank-statement-tidewater",
  ]);
  for (const full of [account, routing]) {
    assert.ok(!openedStatement!.body.includes(full), "a full number is shown");
    assert.ok(openedStatement!.body.includes(`****${full.slice(-4)}`));
  }
});

test("a Page opens as written", async () => {
  const store = await seeded();
  await writeFile(
    join(root, "demo/entities/bank.md"),
    "Account ****6789 (src: x)\n"
  );
  assert.equal(
    (await openWikiPage(store, ["entities", "bank.md"]))?.body,
    "Account ****6789 (src: x)\n"
  );
});

test("a missing or malformed path opens nothing", async () => {
  const store = await seeded();
  assert.equal(await openWikiPage(store, ["entities", "nope.md"]), null);
  assert.equal(await openWikiPage(store, ["..", "secrets.md"]), null);
  assert.equal(await openWikiPage(store, ["%2e%2e", "x.md"]), null);
});
