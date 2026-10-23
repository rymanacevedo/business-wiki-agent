import { resolve } from "node:path";
import { defaultBible } from "../../packages/corpus/bible";
import { createRetrieval, type Retrieval } from "../../packages/wiki-retrieval";
import { gatewayEmbed } from "../../packages/wiki-retrieval/gateway";
import { createWikiStore, type WikiStore } from "../../packages/wiki-store";
import {
  EVAL_RUN_ENV,
  evalWiki,
  sessionNamespace,
  type SessionCtx,
} from "./eval-wiki";

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
 * The WikiStore for this session. Under an eval run (`CLERK_EVAL_RUN`, set by
 * the eval setup) it is `eval/<runId>/<sessionId>`, seeded from `WIKI_SEED`
 * on first access; otherwise the deployment's namespace (`WIKI_NAMESPACE`,
 * default `demo`). Never derived from model input. Pass the tool or hook
 * `ctx`; without one, the session is the one a tool last saw.
 */
export function wiki(ctx?: SessionCtx): WikiStore {
  const run = process.env[EVAL_RUN_ENV];
  if (run) return evalWiki(run, ctx);
  return createWikiStore({ namespace: process.env.WIKI_NAMESPACE ?? "demo" });
}

const RETRIEVALS = 8;
const retrievals = new Map<string, Retrieval>();

/**
 * The embedding adapter: the Gateway's (with `AI_GATEWAY_API_KEY`) unless
 * `CLERK_RETRIEVAL_EMBEDDINGS=0` makes retrieval lexical-only.
 */
export function retrievalEmbed() {
  return process.env.CLERK_RETRIEVAL_EMBEDDINGS === "0"
    ? undefined
    : gatewayEmbed;
}

/**
 * The Retrieval instance for this session's namespace, kept across tool
 * calls so its section index survives the fresh store `wiki(ctx)` builds
 * each time. One per namespace (each eval session has its own), at most the
 * 8 most recently used.
 */
export function retrieval(ctx?: SessionCtx): Retrieval {
  const run = process.env[EVAL_RUN_ENV];
  const namespace = run
    ? sessionNamespace(run, ctx)
    : (process.env.WIKI_NAMESPACE ?? "demo");
  // The local store directory is part of the key: tests and scripts move it.
  const key = `${resolve(process.env.WIKI_STORE_DIR ?? ".wiki-store")}:${namespace}`;
  const instance =
    retrievals.get(key) ??
    createRetrieval({ store: wiki(ctx), embed: retrievalEmbed() });
  retrievals.delete(key);
  retrievals.set(key, instance);
  for (const stale of retrievals.keys()) {
    if (retrievals.size <= RETRIEVALS) break;
    retrievals.delete(stale);
  }
  return instance;
}

export const SOURCES = "sources/";
export const SUMMARIES = "summaries/";

/** A Source id is its file stem; Sources are `.md` or `.txt`. */
export function sourceId(path: string): string {
  return path.slice(SOURCES.length).replace(/\.(md|txt)$/, "");
}

/**
 * Every Source id, split by status: Ingested (it has a summary Page) or
 * Inbox (not yet Ingested), each in the store's listing order.
 */
export async function sourceStatus(
  store: WikiStore
): Promise<{ inbox: string[]; ingested: string[] }> {
  const summaries = new Set(
    (await store.list(SUMMARIES)).map((path) =>
      path.slice(SUMMARIES.length).replace(/\.md$/, "")
    )
  );
  const ids = (await store.list(SOURCES)).map(sourceId);
  return {
    inbox: ids.filter((id) => !summaries.has(id)),
    ingested: ids.filter((id) => summaries.has(id)),
  };
}
