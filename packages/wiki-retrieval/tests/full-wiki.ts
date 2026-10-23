import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWikiStore, type WikiStore } from "../../wiki-store";
import { seedNamespace } from "../../wiki-store/seed";

export const FULL = resolve(import.meta.dirname, "../../../fixtures/full");

/** A local WikiStore seeded from `fixtures/full` (and an empty Sources dir) in a temp dir. */
export async function fullWiki(): Promise<{
  store: WikiStore;
  cleanup: () => void;
}> {
  const root = mkdtempSync(join(tmpdir(), "wiki-retrieval-test-"));
  const sourcesDir = mkdtempSync(join(tmpdir(), "wiki-retrieval-sources-"));
  const env = { WIKI_STORE_DIR: root };
  await seedNamespace({ namespace: "t", fixtureDir: FULL, sourcesDir, env });
  return {
    store: createWikiStore({ namespace: "t", env }),
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(sourcesDir, { recursive: true, force: true });
    },
  };
}
