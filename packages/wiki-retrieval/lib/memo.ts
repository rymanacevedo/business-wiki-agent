// The in-process memo: every indexable Page's parsed form, kept current by
// comparing the store's etag manifest on every call.

import { createHash } from "node:crypto";
import type { WikiStore } from "../../wiki-store";
import { splitPage } from "../../page-edits";
import { readFrontmatter } from "./frontmatter";
import { sectionsOf, type Section } from "./sections";

/** Scaffolding Pages: never Matches, never neighbours, never indexed. */
const SCAFFOLDING = new Set(["index.md", "log.md", "SCHEMA.md"]);
const READS_IN_FLIGHT = 10;

export function indexable(path: string): boolean {
  return (
    path.endsWith(".md") &&
    !SCAFFOLDING.has(path) &&
    !path.startsWith("sources/")
  );
}

export type MemoPage = {
  path: string;
  etag: string;
  /** sha256 hex of the body: the embedding cache's key, the same on every backend. */
  hash: string;
  title: string;
  kind: string;
  status: string;
  flags: string[];
  /** The Page's raw frontmatter lines and body, for the Link table to come. */
  frontmatter: string[];
  body: string[];
  sections: Section[];
};

export function parsePage(path: string, text: string, etag: string): MemoPage {
  const { frontmatter, body } = splitPage(text);
  const read = readFrontmatter(frontmatter);
  return {
    path,
    etag,
    hash: createHash("sha256").update(text).digest("hex"),
    title: read.value("title") ?? path,
    kind: read.value("kind") ?? "unknown",
    status: read.value("status") ?? "unknown",
    flags: read.flags,
    frontmatter,
    body,
    sections: sectionsOf(path, read, body),
  };
}

/**
 * Run `task` over `items` with at most `limit` in flight. On a failure no
 * new task starts, every running one settles, then the first error throws:
 * nothing is still writing when the caller moves on.
 */
async function pool<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (!failure && next < items.length) {
      const item = items[next++];
      try {
        await task(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  if (failure) throw failure.error;
}

/**
 * The Pages at one revision of the memo. Never changed once returned: a
 * caller that awaits mid-way still holds the revision it started from,
 * whatever refreshes run meanwhile.
 */
export type Snapshot = {
  pages: ReadonlyMap<string, MemoPage>;
  /** Changes whenever the Pages do, so derived indexes know when to rebuild. */
  version: number;
};

export type Memo = {
  /**
   * Bring the memo level with the store: one `manifest("")`, then a read of
   * each new or changed Page only, deleted Pages dropped. Returns a Snapshot
   * of the result; a refresh that throws publishes none.
   */
  refresh(): Promise<Snapshot>;
};

export function createMemo(store: WikiStore): Memo {
  const pages = new Map<string, MemoPage>();
  let version = 0;
  let snapshot: Snapshot = { pages: new Map(), version };
  let queue: Promise<unknown> = Promise.resolve();

  async function sync() {
    const manifest = (await store.manifest("")).filter((e) =>
      indexable(e.path)
    );
    // The version moves with every change to `pages`, as it happens, so a
    // refresh that throws part-way still invalidates what was built before.
    const live = new Set(manifest.map((e) => e.path));
    for (const path of pages.keys())
      if (!live.has(path)) {
        pages.delete(path);
        version++;
      }
    const stale = manifest.filter((e) => pages.get(e.path)?.etag !== e.etag);
    await pool(stale, READS_IN_FLIGHT, async ({ path }) => {
      const entry = await store.read(path);
      if (entry) pages.set(path, parsePage(path, entry.body, entry.etag));
      else pages.delete(path);
      version++;
    });
    // Copy on change only: `pages` keeps mutating, the Snapshot never does.
    if (snapshot.version !== version)
      snapshot = { pages: new Map(pages), version };
    return snapshot;
  }

  return {
    refresh() {
      // One refresh at a time per instance, so concurrent calls never
      // interleave their reads into the same Pages.
      const run = queue.then(sync, sync);
      queue = run.catch(() => {});
      return run;
    },
  };
}
