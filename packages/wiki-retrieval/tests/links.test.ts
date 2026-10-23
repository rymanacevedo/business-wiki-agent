import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval, type RetrievalResult } from "../index";
import { fullWiki } from "./full-wiki";

let store: WikiStore;
let cleanup = () => {};
beforeEach(async () => {
  ({ store, cleanup } = await fullWiki());
});
afterEach(() => cleanup());

const PAY_4471 =
  "obligations/2026-10-12-pay-invoice-cascade-appliance-parts-4471.md";
const NEW = "obligations/2026-10-12-pay-invoice-zquorblat.md";
const via = (r: RetrievalResult, path: string) =>
  r.pages.find((p) => p.path === path && p.role === "neighbour")?.via;

/** One Obligation with every Link kind, a dangling link and a self-link. */
const page = (extra = "") => `---
title: Pay invoice zquorblat
kind: obligation
sources: [2026-09-12-invoice-cascade-parts-4471]
status: superseded
superseded_by: ${PAY_4471}
counterparty: cascade-appliance-parts
due: 2026-10-12
flags: []
---

- **Record**: [Invoice](../summaries/2026-09-12-invoice-cascade-parts-4472.md#total) (src: 2026-08-03-receipt-harbor-hardware, 2026-09-18-receipt-harbor-hardware)
- **Self**: [this Page](./2026-10-12-pay-invoice-zquorblat.md); [gone](../entities/no-such-entity.md); [site](https://example.com/a.md); [index](../index.md) (src: no-such-source)
${extra}`;

describe("the Link table", () => {
  test("the four kinds from a Page's text, collapsed per Page pair, both ways", async () => {
    await store.write(NEW, page(), { etag: null });
    const retrieval = createRetrieval({ store });
    const result = await retrieval.search({
      query: "zquorblat",
      kind: "obligation",
      limit: 1,
      neighbourhood: true,
    });
    assert.equal(result.pages[0].path, NEW);
    const labelled = Object.fromEntries(
      result.pages
        .filter((p) => p.role === "neighbour")
        .map((p) => [p.path, p.via![0].labels])
    );
    assert.deepEqual(labelled, {
      [PAY_4471]: ["supersedes"],
      "entities/cascade-appliance-parts.md": ["party of"],
      "summaries/2026-09-12-invoice-cascade-parts-4471.md": ["cited by"],
      "summaries/2026-09-12-invoice-cascade-parts-4472.md": ["linked from"],
      "summaries/2026-08-03-receipt-harbor-hardware.md": ["cited by"],
      "summaries/2026-09-18-receipt-harbor-hardware.md": ["cited by"],
    });
    // Dangling targets, the self-link, external links and scaffolding drop silently.

    const back = await retrieval.search({
      query: "pay invoice Cascade 4471",
      kind: "obligation",
      limit: 1,
      neighbourhood: true,
    });
    assert.equal(back.pages[0].path, PAY_4471);
    assert.deepEqual(via(back, NEW), [
      { match: PAY_4471, labels: ["superseded by"] },
    ]);
  });

  test("refreshed with the memo: an edit adds and removes Links, a new Page brings its backward Links", async () => {
    const retrieval = createRetrieval({ store });
    const fromPay = () =>
      retrieval.search({
        query: "pay invoice Cascade 4471",
        kind: "obligation",
        limit: 1,
        neighbourhood: true,
      });
    assert.equal(via(await fromPay(), NEW), undefined);
    await store.write(NEW, page(), { etag: null });
    assert.deepEqual(via(await fromPay(), NEW)?.[0].labels, ["superseded by"]);

    const current = await store.read(NEW);
    assert.ok(current);
    await store.write(NEW, current.body.replace(/superseded_by: .*\n/, ""), {
      etag: current.etag,
    });
    assert.equal(via(await fromPay(), NEW), undefined);
  });

  test("a deleted Page's Links go with it", async () => {
    await store.write(NEW, page(), { etag: null });
    const hidden = new Set<string>();
    const view: WikiStore = {
      ...store,
      async manifest(prefix) {
        return (await store.manifest(prefix)).filter(
          (e) => !hidden.has(e.path)
        );
      },
    };
    const retrieval = createRetrieval({ store: view });
    const fromPay = () =>
      retrieval.search({
        query: "pay invoice Cascade 4471",
        kind: "obligation",
        limit: 1,
        neighbourhood: true,
      });
    assert.ok(via(await fromPay(), NEW));
    hidden.add(NEW);
    assert.equal(via(await fromPay(), NEW), undefined);
  });

  test("a Page whose frontmatter is not YAML still yields its body Links", async () => {
    await store.write(NEW, page().replace("flags: []", "flags: [unclosed"), {
      etag: null,
    });
    // Its kind is unreadable too, so no kind filter.
    const result = await createRetrieval({ store }).search({
      query: "zquorblat",
      limit: 1,
      neighbourhood: true,
    });
    assert.equal(result.pages[0].path, NEW);
    assert.ok(
      via(result, "summaries/2026-09-12-invoice-cascade-parts-4472.md")
    );
  });

  test("Markdown links are read as Markdown: code and escapes are not links, reference links are", async () => {
    await store.write(
      NEW,
      `---
title: Pay invoice zquorblat
kind: obligation
status: active
flags: []
---

- **Example**: \`[Bank](../summaries/2026-08-31-bank-statement-tidewater.md)\` is how a link looks.
- **Escaped**: \\[Fuel](../summaries/2026-08-11-receipt-portside-fuel.md) is not a link.
- **Code citation**: \`(src: 2026-08-14-receipt-paper-trail-office)\` is how a Citation looks.

\`\`\`
[Ridgeline](../summaries/2026-08-20-invoice-ridgeline-tools-r20931.md) (src: 2026-09-01-invoice-lumen-sites-hosting)
\`\`\`

- **Record**: [Invoice 4472][record].

[record]: ../summaries/2026-09-12-invoice-cascade-parts-4472.md
`,
      { etag: null }
    );
    const result = await createRetrieval({ store }).search({
      query: "zquorblat",
      kind: "obligation",
      limit: 1,
      neighbourhood: true,
    });
    assert.equal(result.pages[0].path, NEW);
    assert.deepEqual(
      result.pages
        .filter((p) => p.role === "neighbour")
        .map((p) => [p.path, p.via![0].labels]),
      [["summaries/2026-09-12-invoice-cascade-parts-4472.md", ["linked from"]]]
    );
  });
  test("a long ordinary Page keeps a Link past its first 16,000 characters", async () => {
    const filler = Array.from(
      { length: 400 },
      (_, i) => `Line ${i} of ordinary prose about the zquorblat invoice.`
    ).join("\n\n");
    await store.write(
      NEW,
      `---
title: Pay invoice zquorblat
kind: obligation
status: active
flags: []
---

${filler}

- **Record**: [Invoice 4472](../summaries/2026-09-12-invoice-cascade-parts-4472.md)
`,
      { etag: null }
    );
    assert.ok((await store.read(NEW))!.body.length > 20_000);
    const result = await createRetrieval({ store }).search({
      query: "zquorblat",
      kind: "obligation",
      limit: 1,
      neighbourhood: true,
    });
    assert.equal(result.pages[0].path, NEW);
    assert.ok(
      via(result, "summaries/2026-09-12-invoice-cascade-parts-4472.md")
    );
  });
  test("a long ordinary Page keeps a reference definition written at its end", async () => {
    const filler = Array.from(
      { length: 400 },
      (_, i) => `- Line ${i} of an ordinary list about the zquorblat invoice.`
    ).join("\n");
    await store.write(
      NEW,
      `---
title: Pay invoice zquorblat
kind: obligation
status: active
flags: []
---

See [Invoice 4472][record] for the total.

${filler}

[record]: ../summaries/2026-09-12-invoice-cascade-parts-4472.md
`,
      { etag: null }
    );
    assert.ok((await store.read(NEW))!.body.length > 20_000);
    const result = await createRetrieval({ store }).search({
      query: "zquorblat",
      kind: "obligation",
      limit: 1,
      neighbourhood: true,
    });
    assert.equal(result.pages[0].path, NEW);
    assert.ok(
      via(result, "summaries/2026-09-12-invoice-cascade-parts-4472.md")
    );
  });
});

describe("code inside containers on a long Page", () => {
  const FAKE = "summaries/2026-08-31-bank-statement-tidewater.md";
  const REAL = "summaries/2026-09-12-invoice-cascade-parts-4472.md";
  const fake = `[Bank](../${FAKE})`;
  const real = `[Invoice 4472](../${REAL})`;
  /** 3,000 copies of `line`: past the cut a chunk is forced at. */
  const many = (line: string) =>
    Array.from({ length: 3000 }, () => `${line} line`).join("\n");

  // Each body holds a code block longer than the forced cut, a link-looking
  // line at its end, and a real Link after it. A whole-body Markdown parse
  // reads only the real one.
  const BODIES: Record<string, string> = {
    "a fence in a blockquote": `> \`\`\`\n${many("> code")}\n> ${fake}\n> \`\`\`\n\n${real}`,
    "a tilde fence in a blockquote": `> ~~~\n${many("> code")}\n> ${fake}\n> ~~~\n\n${real}`,
    "a fence two quotes deep": `> > \`\`\`\n${many("> > code")}\n> > ${fake}\n> > \`\`\`\n\n${real}`,
    "a fence in a list item in a quote": `> - \`\`\`\n${many(">   code")}\n>   ${fake}\n>   \`\`\`\n\n${real}`,
    "a fence in a quote in a list item": `- > \`\`\`\n${many("  > code")}\n  > ${fake}\n  > \`\`\`\n\n${real}`,
    "a fence opening a list item": `- \`\`\`\n${many("  code")}\n  ${fake}\n  \`\`\`\n\n${real}`,
    "a fence in an ordered item": `1.  \`\`\`\n${many("    code")}\n    ${fake}\n    \`\`\`\n\n${real}`,
    "a fence in a nested list item": `- a\n  - \`\`\`\n${many("    code")}\n    ${fake}\n    \`\`\`\n\n${real}`,
    "a fence on an item's continuation line": `- a\n\n    - b\n\n      \`\`\`\n${many("      code")}\n      ${fake}\n      \`\`\`\n\n${real}`,
    "a longer fence holding a shorter one": `> \`\`\`\`\n> \`\`\`\n${many("> code")}\n> ${fake}\n> \`\`\`\`\n\n${real}`,
    "a fence with quoted blank lines": `> \`\`\`\n${many("> code\n>")}\n> ${fake}\n> \`\`\`\n\n${real}`,
    "an indented fence in a quote": `>    \`\`\`\n${many(">    code")}\n>    ${fake}\n>    \`\`\`\n\n${real}`,
    "a raw pre block in a quote": `> <pre>\n${many("> code")}\n> ${fake}\n> </pre>\n\n${real}`,
    "a comment in a quote": `> <!--\n${many("> code")}\n> ${fake}\n> -->\n\n${real}`,
    "an unclosed fence the quote ends": `> \`\`\`\n${many("> code")}\n> ${fake}\n\n${many("prose")}\n${real}`,
    "a fence after a quote and a tab": `>\t\`\`\`\n${many(">\tcode")}\n>\t${fake}\n>\t\`\`\`\n\n${real}`,
    "an item's fence holding an unindented line": `- a\n\n  \`\`\`\n${many("  code")}\n${fake}\n  \`\`\`\n\n${real}`,
    "indented code": `Prose.\n\n${many("    code")}\n    ${fake}\n\n${real}`,
    "indented code holding quote markers": `${many("    > code")}\n    > ${fake}\n\n${real}`,
    "a pre block after a long paragraph in a list item": `- a\n${many("  prose")}\n  <pre>\n${many("  code")}\n  ${fake}\n  </pre>\n\n${real}`,
    "a pre block after a quote and a tab": `>\tprose\n>\t<pre>\n${many(">\tcode")}\n>\t${fake}\n>\t</pre>\n\n${real}`,
    "an inline comment across a chunk cut": `Prose before <!--\n${many("comment")}\n${fake}\n-->\nmore prose\n\n${real}`,
    "an inline comment across a piece cut": `${"word ".repeat(300)}<!-- ${"word ".repeat(300)}${fake} -->${" word".repeat(50)}\n\n${many("prose")}\n\n${real}`,
    "an unclosed fence the next item ends": `- \`\`\`\n${many("  code")}\n  ${fake}\n- next\n${many("  prose")}\n  ${real}`,
  };

  for (const [name, body] of Object.entries(BODIES))
    test(`${name}: the code carries no Link, the Link after it does`, async () => {
      await store.write(
        NEW,
        `---\ntitle: Pay invoice zquorblat\nkind: obligation\nstatus: active\nflags: []\n---\n\n${body}\n`,
        { etag: null }
      );
      assert.ok((await store.read(NEW))!.body.length > 16_000);
      const result = await createRetrieval({ store }).search({
        query: "zquorblat",
        kind: "obligation",
        limit: 1,
        neighbourhood: true,
      });
      assert.equal(result.pages[0].path, NEW);
      assert.equal(via(result, FAKE), undefined, "no Link from code");
      assert.ok(via(result, REAL), "the real Link is kept");
    });
});

describe("list items as marked reads them: padding and lazy lines", () => {
  const A = "summaries/2026-08-31-bank-statement-tidewater.md";
  const B = "summaries/2026-09-12-invoice-cascade-parts-4472.md";
  const many = (line: string) =>
    Array.from({ length: 3000 }, () => `${line} line`).join("\n");

  // `want` is what a whole-body parse links: [A, B] for the link-looking
  // lines in body order.
  const CASES: Array<{ name: string; body: string; want: [boolean, boolean] }> =
    [
      {
        // Content starts at column 3, so the two-space lines leave the item
        // and end its fence; the second fence then holds B.
        name: "a bullet and two spaces",
        body: `-  \`\`\`\n${many("  content")}\n  [A](../${A})\n  \`\`\`\n\n[B](../${B})`,
        want: [true, false],
      },
      {
        name: "an ordered marker and three spaces",
        body: `1.   \`\`\`\n${many("     content")}\n     [A](../${A})\n     \`\`\`\n\n[B](../${B})`,
        want: [false, true],
      },
      {
        // Five spaces: the content starts one column in, as indented code.
        name: "a bullet and five spaces",
        body: `-     \`\`\`\n  content\n\n${many("      content")}\n      [A](../${A})\n\n[B](../${B})`,
        want: [false, true],
      },
      {
        // The quote's lines without `>` still continue its list item, so
        // A is code; the dedented fence leaves the quote and holds B.
        name: "a list item's fence in a quote, continued without `>`",
        body: `> - \`\`\`\n${many("  code")}\n  [A](../${A})\n  \`\`\`\n\n[B](../${B})`,
        want: [false, false],
      },
      {
        name: "an ordered item's fence in a quote, closed back inside it",
        body: `> 1. \`\`\`\n${many("   code")}\n   [A](../${A})\n>    \`\`\`\n\n[B](../${B})`,
        want: [false, true],
      },
    ];

  for (const { name, body, want } of CASES)
    test(`${name}: the Links are the ones a whole-body read finds`, async () => {
      await store.write(
        NEW,
        `---\ntitle: Pay invoice zquorblat\nkind: obligation\nstatus: active\nflags: []\n---\n\n${body}\n`,
        { etag: null }
      );
      const result = await createRetrieval({ store }).search({
        query: "zquorblat",
        kind: "obligation",
        limit: 1,
        neighbourhood: true,
      });
      assert.equal(result.pages[0].path, NEW);
      assert.deepEqual([!!via(result, A), !!via(result, B)], want);
    });
});
