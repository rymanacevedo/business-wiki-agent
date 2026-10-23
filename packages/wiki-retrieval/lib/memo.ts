// The in-process memo: every indexable Page's parsed form, kept current by
// comparing the store's etag manifest on every call.

import type { WikiStore } from "../../wiki-store";
import { splitPage } from "../../page-edits";
import {
  frontmatterValue,
  listItem,
  sectionise,
  type Section,
} from "./sections";

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
  title: string;
  kind: string;
  status: string;
  flags: string[];
  /** The Page's raw frontmatter lines and body, for the Link table. */
  frontmatter: string[];
  body: string[];
  sections: Section[];
};

/** The `flags` list, flow (`[a, b]`) or block (`- a` lines) style, comments ignored. */
function flagsOf(frontmatter: string[]): string[] {
  const at = frontmatter.findIndex((line) => /^flags\s*:/.test(line));
  if (at === -1) return [];
  const inline = frontmatter[at]
    .slice(frontmatter[at].indexOf(":") + 1)
    .replace(/(^|\s)#.*$/, "")
    .trim();
  const items: string[] = [];
  if (inline) items.push(...inline.replace(/[[\]]/g, "").split(","));
  else
    for (const line of frontmatter.slice(at + 1)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const item = listItem(line);
      if (item === undefined) break;
      items.push(item);
    }
  return items.map((f) => f.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

function parse(path: string, text: string, etag: string): MemoPage {
  const { frontmatter, body } = splitPage(text);
  return {
    path,
    etag,
    title: frontmatterValue(frontmatter, "title") ?? path,
    kind: frontmatterValue(frontmatter, "kind") ?? "unknown",
    status: frontmatterValue(frontmatter, "status") ?? "unknown",
    flags: flagsOf(frontmatter),
    frontmatter,
    body,
    sections: sectionise(path, text),
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

export type Memo = {
  /**
   * Bring the memo level with the store: one `manifest("")`, then a read of
   * each new or changed Page only, deleted Pages dropped. Returns the Pages
   * and a version that changes whenever they do, so derived indexes know
   * when to rebuild.
   */
  refresh(): Promise<{ pages: Map<string, MemoPage>; version: number }>;
};

export function createMemo(store: WikiStore): Memo {
  const pages = new Map<string, MemoPage>();
  let version = 0;
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
      if (entry) pages.set(path, parse(path, entry.body, entry.etag));
      else pages.delete(path);
      version++;
    });
    return { pages, version };
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
