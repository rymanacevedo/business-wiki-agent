import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { readWikiDir } from "../index";

test("a fixture directory reads as its Pages, without Sources or the retrieval cache", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-check-read-"));
  try {
    for (const [path, body] of Object.entries({
      "index.md": "# Index\n",
      "entities/acme.md": "# Acme\n",
      "sources/2026-01-01-x.md": "source\n",
      "cache/embeddings.json": "{}",
      "cache/notes.md": "# not a Page\n",
    })) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    assert.deepEqual(
      [...(await readWikiDir(dir))],
      [
        ["entities/acme.md", "# Acme\n"],
        ["index.md", "# Index\n"],
      ]
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
