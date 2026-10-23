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
});
