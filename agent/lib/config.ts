import { defaultBible } from "../../packages/corpus/bible";
import { createWikiStore, type WikiStore } from "../../packages/wiki-store";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Clerk's configuration. The Owner and Business come from the Bible; the
 * Demo Date comes from `DEMO_DATE` (default: the Bible's), never the clock.
 */
export const clerkConfig = {
  owner: defaultBible.owner.name,
  business: defaultBible.business.legalName,
  get demoDate(): string {
    const date = process.env.DEMO_DATE ?? defaultBible.demoDate;
    if (!DATE.test(date))
      throw new Error(`DEMO_DATE must be YYYY-MM-DD, got ${date}`);
    return date;
  },
};

/**
 * The WikiStore for this deployment's namespace (`WIKI_NAMESPACE`, default
 * `demo`). Never derived from model input.
 */
export function wiki(): WikiStore {
  return createWikiStore({ namespace: process.env.WIKI_NAMESPACE ?? "demo" });
}

export const SOURCES = "sources/";
export const SUMMARIES = "summaries/";

/** A Source id is its file stem; Sources are `.md` or `.txt`. */
export function sourceId(path: string): string {
  return path.slice(SOURCES.length).replace(/\.(md|txt)$/, "");
}
