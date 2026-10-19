import { resolve } from "node:path";
import { defineState } from "eve/context";
import { createWikiStore, type WikiStore } from "../../packages/wiki-store";
import { seedNamespace } from "../../packages/wiki-store/seed";

/** Set by `evals/evals.config.ts` setup: the run id that scopes every eval session. */
export const EVAL_RUN_ENV = "CLERK_EVAL_RUN";
export const SEEDS = ["base", "full"] as const;

/** The namespace of one eval session: `eval/<runId>/<sessionId>`. */
export function evalNamespace(runId: string, sessionId: string): string {
  return `eval/${runId}/${sessionId}`;
}

/**
 * The session id, remembered from the last tool or hook that had `ctx`, for
 * code eve runs without one (a tool's async input validation).
 */
const sessionSlot = defineState<string | null>("clerk.session-id", () => null);

export type SessionCtx = { session: { id: string } };

function sessionId(ctx: SessionCtx | undefined): string {
  if (ctx) {
    try {
      if (sessionSlot.get() !== ctx.session.id)
        sessionSlot.update(() => ctx.session.id);
    } catch {
      // Outside eve execution (scripts, tests): nothing to remember.
    }
    return ctx.session.id;
  }
  let remembered: string | null = null;
  try {
    remembered = sessionSlot.get();
  } catch {
    remembered = null;
  }
  if (!remembered)
    throw new Error(
      "Eval run without a session id: pass the tool's ctx to wiki(ctx)"
    );
  return remembered;
}

const seeding = new Map<string, Promise<void>>();

/** Copy `fixtures/<WIKI_SEED>` and the Corpus Sources into an empty namespace, once. */
function ensureSeeded(namespace: string): Promise<void> {
  const key = `${resolve(process.env.WIKI_STORE_DIR ?? ".wiki-store")}:${namespace}`;
  let pending = seeding.get(key);
  if (!pending) {
    pending = (async () => {
      const seed = process.env.WIKI_SEED ?? "";
      if (!(SEEDS as readonly string[]).includes(seed))
        throw new Error(
          `WIKI_SEED must be one of ${SEEDS.join(", ")}, got "${seed}"`
        );
      const store = createWikiStore({ namespace });
      if ((await store.list("")).length > 0) return;
      await seedNamespace({
        namespace,
        fixtureDir: resolve("fixtures", seed),
        sourcesDir: resolve("corpus/sources"),
      });
    })();
    seeding.set(key, pending);
    pending.catch(() => seeding.delete(key));
  }
  return pending;
}

/** A WikiStore over one eval session's namespace that seeds itself before first use. */
export function evalWiki(
  runId: string,
  ctx: SessionCtx | undefined
): WikiStore {
  let namespace: string | undefined;
  const ready = async () => {
    namespace ??= evalNamespace(runId, sessionId(ctx));
    await ensureSeeded(namespace);
    return createWikiStore({ namespace });
  };
  return {
    read: async (path) => (await ready()).read(path),
    write: async (path, body, options) =>
      (await ready()).write(path, body, options),
    list: async (prefix) => (await ready()).list(prefix),
  };
}
