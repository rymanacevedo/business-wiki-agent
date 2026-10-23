import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { WikiStore } from "../../wiki-store";
import { createRetrieval } from "../index";
import { fullWiki } from "./full-wiki";

let store: WikiStore;
let cleanup = () => {};
beforeEach(async () => {
  ({ store, cleanup } = await fullWiki());
});
afterEach(() => cleanup());

test("flagged lists every Page carrying the flag, sorted by path", async () => {
  const retrieval = createRetrieval({ store });
  assert.deepEqual(await retrieval.flagged("conflict"), [
    { path: "profile.md", kind: "profile", status: "active" },
  ]);
  assert.deepEqual(await retrieval.flagged("suspicious-content"), [
    {
      path: "summaries/2026-10-02-invoice-eastside-auto-3381.md",
      kind: "summary",
      status: "active",
    },
  ]);
  assert.deepEqual(await retrieval.flagged("needs-owner"), []);
});

test("flagged sees a flag added since the last call, in either YAML list style", async () => {
  const retrieval = createRetrieval({ store });
  await retrieval.flagged("needs-owner");
  await store.write(
    "entities/zeta.md",
    "---\ntitle: Zeta\nkind: entity\nstatus: active\nflags:\n  - needs-owner\n  - conflict\n---\n\nZETA\n",
    { etag: null }
  );
  await store.write(
    "entities/alpha.md",
    "---\ntitle: Alpha\nkind: entity\nstatus: active\nflags: [needs-owner]\n---\n\nALPHA\n",
    { etag: null }
  );
  assert.deepEqual(
    (await retrieval.flagged("needs-owner")).map((p) => p.path),
    ["entities/alpha.md", "entities/zeta.md"]
  );
});

test("flagged reads past YAML comments", async () => {
  const retrieval = createRetrieval({ store });
  await store.write(
    "entities/inline.md",
    "---\ntitle: Inline\nkind: entity\nstatus: active\nflags: [needs-owner] # set by Lint\n---\n\nINLINE\n",
    { etag: null }
  );
  await store.write(
    "entities/block.md",
    "---\ntitle: Block\nkind: entity\nstatus: active\nflags:\n  # set by Lint\n  - needs-owner # why\n---\n\nBLOCK\n",
    { etag: null }
  );
  assert.deepEqual(
    (await retrieval.flagged("needs-owner")).map((p) => p.path),
    ["entities/block.md", "entities/inline.md"]
  );
});

// Each Page spells `flags` a different way; `want` is whether it carries
// needs-owner. The frontmatter is read as YAML, so every valid spelling
// counts and a malformed frontmatter carries no flags.
const SPELLINGS: { name: string; flags: string; want: boolean }[] = [
  {
    name: "flow-multiline",
    flags: "flags: [\n  conflict,\n  needs-owner\n  ]",
    want: true,
  },
  {
    name: "flow-multiline-comments",
    flags: "flags: [ # set by Lint\n  needs-owner, # why\n]",
    want: true,
  },
  {
    name: "flow-quoted",
    flags: `flags: ["needs-owner", 'conflict']`,
    want: true,
  },
  {
    name: "block-quoted",
    flags: `flags:\n  - "needs-owner"\n  - 'conflict'`,
    want: true,
  },
  {
    name: "block-deep-indent",
    flags: "flags:\n        - conflict\n        - needs-owner",
    want: true,
  },
  { name: "block-no-indent", flags: "flags:\n- needs-owner", want: true },
  { name: "block-blank-line", flags: "flags:\n\n  - needs-owner", want: true },
  { name: "scalar", flags: "flags: needs-owner", want: true },
  {
    name: "scalar-quoted",
    flags: `flags: "needs-owner" # one flag`,
    want: true,
  },
  {
    name: "empty-flow",
    flags: "flags: [] # any of: conflict, needs-owner",
    want: false,
  },
  { name: "empty-null", flags: "flags:", want: false },
  { name: "empty-tilde", flags: "flags: ~", want: false },
  { name: "prefix-only", flags: "flags: [needs-owner-later]", want: false },
  {
    name: "commented-out",
    flags: "flags: []\n# flags: [needs-owner]",
    want: false,
  },
  {
    name: "nested-not-page",
    flags: "flags: []\nexpense:\n  flags: [needs-owner]",
    want: false,
  },
  {
    name: "alias",
    flags: "owners: &owner [needs-owner]\nflags: *owner",
    want: true,
  },
  {
    name: "nested-item-ignored",
    flags: "flags: [[needs-owner], conflict]",
    want: false,
  },
  {
    name: "malformed-duplicate",
    flags: "flags: []\nflags: [needs-owner]",
    want: false,
  },
  {
    name: "malformed-tab-indent",
    flags: "flags:\n\t- needs-owner",
    want: false,
  },
  {
    name: "malformed-unclosed",
    flags: "flags: [needs-owner\nnote: x",
    want: false,
  },
  {
    name: "malformed-colon",
    flags: "flags: [needs-owner]\nnote: a: b",
    want: false,
  },
];

test("flagged reads every YAML spelling of flags, and none from a malformed frontmatter", async () => {
  const retrieval = createRetrieval({ store });
  for (const { name, flags } of SPELLINGS)
    await store.write(
      `entities/${name}.md`,
      `---\ntitle: ${name}\nkind: entity\nstatus: active\n${flags}\n---\n\nBody of ${name}, flags: [needs-owner]\n`,
      { etag: null }
    );
  assert.deepEqual(
    (await retrieval.flagged("needs-owner")).map((p) => p.path),
    SPELLINGS.filter((s) => s.want)
      .map((s) => `entities/${s.name}.md`)
      .sort()
  );
  const conflict = (await retrieval.flagged("conflict")).map((p) => p.path);
  for (const name of [
    "flow-multiline",
    "flow-quoted",
    "block-quoted",
    "block-deep-indent",
  ])
    assert.ok(conflict.includes(`entities/${name}.md`), name);
});

test("a Page with a malformed frontmatter is still searchable by its body", async () => {
  const retrieval = createRetrieval({ store });
  await store.write(
    "entities/broken.md",
    "---\ntitle: Broken\nkind: entity\nflags: [needs-owner\n---\n\nZQUORBLAT body text\n",
    { etag: null }
  );
  const result = await retrieval.search({ query: "zquorblat" });
  assert.equal(result.pages[0]?.path, "entities/broken.md");
  assert.deepEqual(await retrieval.flagged("needs-owner"), []);
});
