// The Link table (decision #46): four kinds derived from what a Page already
// says, collapsed per Page pair, followed both ways.

import { parseFrontmatter } from "../../page-edits";
import type { MemoPage } from "./memo";

export const LINK_KINDS = ["cites", "links", "party", "supersedes"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/**
 * How the neighbour stands to the Match that reached it. `forward` is a Link
 * the Match carries (the Match cites the neighbour: the neighbour is "cited
 * by" it); `backward` is one the neighbour carries.
 */
const LABELS: Record<LinkKind, { forward: string; backward: string }> = {
  cites: { forward: "cited by", backward: "cites" },
  links: { forward: "linked from", backward: "links to" },
  party: { forward: "party of", backward: "names party" },
  supersedes: { forward: "supersedes", backward: "superseded by" },
};

const CITATION = /\(src: ([^)]*)\)/g;
const SOURCE_ID = /^[a-z0-9][a-z0-9.-]*$/;
const MARKDOWN_LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+[^)]*)?\)/g;
/** A scheme (`https:`, `mailto:`), a root-relative path or a bare anchor. */
const NOT_RELATIVE = /^([a-z][a-z0-9+.-]*:|\/|#)/i;

const summaryOf = (id: string) => `summaries/${id}.md`;

/** `target` resolved against the linking Page's folder; null if it climbs out. */
function resolveRelative(from: string, target: string): string | null {
  let decoded = target.split(/[#?]/)[0];
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the raw text: a malformed escape is not a Page path anyway.
  }
  const parts = from.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") parts.push(segment);
    else if (parts.length === 0) return null;
    else parts.pop();
  }
  return parts.join("/");
}

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).flatMap((v) =>
    typeof v === "string" || typeof v === "number" ? [String(v).trim()] : []
  );

/** The frontmatter as data, with page-edits' parser; `{}` when it is not YAML. */
function frontmatterOf(page: MemoPage): Record<string, unknown> {
  try {
    const data: unknown = parseFrontmatter(page.frontmatter)?.toJS();
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Every Link a Page carries, by target, before dangling targets are known. */
function outgoing(page: MemoPage): Map<string, Set<LinkKind>> {
  const out = new Map<string, Set<LinkKind>>();
  const add = (to: string | null, kind: LinkKind) => {
    if (!to || to === page.path) return;
    const kinds = out.get(to) ?? new Set<LinkKind>();
    kinds.add(kind);
    out.set(to, kinds);
  };
  const fm = frontmatterOf(page);
  const text = page.body.join("\n");
  for (const [, ids] of text.matchAll(CITATION))
    for (const id of ids.split(","))
      if (SOURCE_ID.test(id.trim())) add(summaryOf(id.trim()), "cites");
  for (const id of strings(fm.sources))
    if (SOURCE_ID.test(id)) add(summaryOf(id), "cites");
  for (const [, target] of text.matchAll(MARKDOWN_LINK))
    if (!NOT_RELATIVE.test(target))
      add(resolveRelative(page.path, target), "links");
  const expense =
    fm.expense && typeof fm.expense === "object"
      ? (fm.expense as Record<string, unknown>)
      : {};
  for (const slug of [
    ...strings(fm.vendor),
    ...strings(expense.vendor),
    ...strings(fm.counterparty),
  ])
    if (slug && slug !== "null") add(`entities/${slug}.md`, "party");
  for (const next of strings(fm.superseded_by)) {
    const path = next.replace(/^\.?\//, "");
    if (path) add(path.endsWith(".md") ? path : `${path}.md`, "supersedes");
  }
  return out;
}

export type Adjacent = { page: string; labels: string[] };

export type LinkTable = {
  /** Bring the table level with the memo's Pages: only changed Pages are re-read. */
  update(pages: Map<string, MemoPage>): void;
  /** The Pages one Link from `path`, each with its labels, sorted by path. */
  around(path: string): Adjacent[];
};

export function createLinkTable(): LinkTable {
  /** Per Page: the etag its Links were read at, and the Links. */
  const from = new Map<
    string,
    { etag: string; to: Map<string, Set<LinkKind>> }
  >();
  /** Per target: the Pages carrying a Link to it. */
  const into = new Map<string, Set<string>>();
  let live = new Map<string, MemoPage>();

  const unlink = (path: string) => {
    for (const to of from.get(path)?.to.keys() ?? []) {
      into.get(to)?.delete(path);
      if (into.get(to)?.size === 0) into.delete(to);
    }
    from.delete(path);
  };

  return {
    update(pages) {
      live = pages;
      for (const path of from.keys()) if (!pages.has(path)) unlink(path);
      for (const page of pages.values()) {
        if (from.get(page.path)?.etag === page.etag) continue;
        unlink(page.path);
        const to = outgoing(page);
        from.set(page.path, { etag: page.etag, to });
        for (const target of to.keys()) {
          const sources = into.get(target) ?? new Set<string>();
          sources.add(page.path);
          into.set(target, sources);
        }
      }
    },
    around(path) {
      const kinds = new Map<
        string,
        { forward: Set<LinkKind>; backward: Set<LinkKind> }
      >();
      const at = (other: string) => {
        const entry = kinds.get(other) ?? {
          forward: new Set<LinkKind>(),
          backward: new Set<LinkKind>(),
        };
        kinds.set(other, entry);
        return entry;
      };
      for (const [to, set] of from.get(path)?.to ?? [])
        if (live.has(to)) for (const k of set) at(to).forward.add(k);
      for (const source of into.get(path) ?? [])
        if (live.has(source))
          for (const k of from.get(source)?.to.get(path) ?? [])
            at(source).backward.add(k);
      return [...kinds.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([page, { forward, backward }]) => ({
          page,
          labels: LINK_KINDS.flatMap((k) => [
            ...(forward.has(k) ? [LABELS[k].forward] : []),
            ...(backward.has(k) ? [LABELS[k].backward] : []),
          ]),
        }));
    },
  };
}
