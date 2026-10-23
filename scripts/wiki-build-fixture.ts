// Build a fixture as Clerk's own output: seed a namespace from fixtures/empty,
// run the local agent (`eve dev`) over the fixture's Sources one Source per
// session in Source-id order, check the result, and write it to fixtures/<name>.
// Usage: bun run wiki:build-fixture [--fixture full|base] [--port 2080]
//          [--ns build-<fixture>] [--resume | --redo-from <source-id>] [--no-write]
//        bun run wiki:build-fixture --embed-only [--fixture full|base]
// After writing the Pages, the embed step writes the fixture's
// cache/embeddings.json through the AI Gateway (AI_GATEWAY_API_KEY).
// --embed-only runs that step alone over the existing fixture directory: no
// Ingest, no other file touched, and only sections whose Page changed are
// embedded again.
// --resume keeps the namespace and skips Sources already Ingested;
// --redo-from restores the snapshot taken just before that Source and goes on.
// One session per Source keeps every session far under the 300K input-token
// cap (one "ingest everything" session exceeded it and left an Ingest half
// done). Any Approval is denied so the build never blocks; it is reported.
// The namespace holds only the plan's Sources, so the Inbox stays unIngested.
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ingestProblems } from "../agent/lib/ingest-check";
import { loadCorpus } from "../packages/corpus";
import { checkWiki } from "../packages/wiki-check";
import { CACHE_PATH } from "../packages/wiki-retrieval";
import { gatewayEmbed } from "../packages/wiki-retrieval/gateway";
import { createWikiStore, type WikiStore } from "../packages/wiki-store";
import { seedNamespace } from "../packages/wiki-store/seed";
import {
  buildPlan,
  holdBackSources,
  type BuiltFixture,
} from "./lib/build-plan";
import { embedFixture } from "./lib/fixture-embed";

const ROOT = resolve(__dirname, "..");
const RATE_LIMIT_WAIT_MS = 75_000;
const MAX_FOLLOW_UPS = 6;
const DENY_REASON =
  "Fixture build: no Approvals are given while building the fixture. Leave the fact as it is and finish the Ingest.";

type Event = { type: string; data?: Record<string, unknown> };
type Report = {
  id: string;
  sessions: string[];
  followUps: string[];
  approvals: string[];
  done: boolean;
  /** The session's input tokens (cached included), as eve counts them for its cap. */
  inputTokens: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);

async function startEve(port: number, namespace: string, trace: boolean) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    WIKI_NAMESPACE: namespace,
  };
  if (!trace) env.LANGSMITH_API_KEY = "";
  const child = spawn(
    resolve(ROOT, "node_modules/.bin/eve"),
    ["dev", "--no-ui", "--port", String(port)],
    { cwd: ROOT, env, detached: true, stdio: ["ignore", "ignore", "pipe"] }
  );
  child.stderr?.on("data", () => {});
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/eve/v1/health`);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await sleep(2000);
  }
  stopEve(child);
  throw new Error(`eve dev did not come up on port ${port}`);
}

function stopEve(child: ChildProcess) {
  // eve dev forks node children: kill the whole process group.
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

class Session {
  id = "";
  private index = 0;
  constructor(private base: string) {}

  private async post(path: string, body: unknown) {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async send(message: string) {
    if (!this.id)
      this.id = String((await this.post("/session", { message })).sessionId);
    else await this.post(`/session/${this.id}`, { message });
  }

  answer(response: Record<string, unknown>) {
    return this.post(`/session/${this.id}`, { inputResponses: [response] });
  }

  /** Read events until the session waits for a message or for input. */
  async drain(): Promise<{ events: Event[]; input?: Record<string, unknown> }> {
    const res = await fetch(
      `${this.base}/session/${this.id}/stream?startIndex=${this.index}`
    );
    const events: Event[] = [];
    let input: Record<string, unknown> | undefined;
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const raw = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!raw) continue;
        this.index++;
        const event = JSON.parse(raw) as Event;
        events.push(event);
        if (event.type === "input.requested")
          input = (event.data?.requests as Record<string, unknown>[])?.[0];
        const waitingOnInput =
          event.type === "turn.waiting" && event.data?.on === "input";
        if ((waitingOnInput && input) || event.type === "session.waiting") {
          await reader.cancel();
          return { events, input: waitingOnInput ? input : undefined };
        }
      }
    }
    return { events, input };
  }
}

async function ingested(store: WikiStore, id: string): Promise<string[]> {
  const missing: string[] = [];
  if (!(await store.read(`summaries/${id}.md`)))
    missing.push(`summaries/${id}.md does not exist yet.`);
  const logBody = (await store.read("log.md"))?.body ?? "";
  if (!logBody.includes(` INGEST [${id}]:`))
    missing.push(`The Log has no INGEST [${id}] line yet.`);
  return missing.length
    ? [...missing, ...(await ingestProblems(store, id))]
    : [];
}

async function ingest(base: string, store: WikiStore, id: string) {
  const report: Report = {
    id,
    sessions: [],
    followUps: [],
    approvals: [],
    done: false,
    inputTokens: 0,
  };
  const session = new Session(base);
  await session.send(
    `Ingest ${id}. Ingest only this Source: do not open or Ingest any other Source.`
  );
  report.sessions.push(session.id);
  for (let followUps = 0; ;) {
    const { events, input } = await session.drain();
    for (const event of events) {
      const usage = event.data?.usage as { inputTokens?: number } | undefined;
      if (event.type === "session.waiting" || event.type === "turn.waiting")
        report.inputTokens = usage?.inputTokens ?? report.inputTokens;
    }
    for (const event of events)
      if (event.type === "actions.requested")
        for (const action of (event.data?.actions ?? []) as {
          toolName?: string;
        }[])
          log(`  ${id}: ${action.toolName}`);
    if (input) {
      if (input.kind === "session-limit") {
        report.followUps.push("session-limit: continue");
        await session.answer({
          requestId: input.requestId,
          optionId: "continue",
        });
      } else {
        report.approvals.push(String(input.prompt ?? "").slice(0, 400));
        log(`  ${id}: Approval requested, denied`);
        await session.answer({
          requestId: input.requestId,
          optionId: "cancel",
          text: DENY_REASON,
        });
      }
      continue;
    }
    let problems = await ingested(store, id);
    // The Ingest also leaves the whole Wiki consistent (Index shape,
    // Citations, frontmatter): the Wiki was clean before this Source.
    if (problems.length === 0) problems = checkWiki(await readNamespace(store));
    if (problems.length === 0) {
      report.done = true;
      return report;
    }
    if (followUps++ >= MAX_FOLLOW_UPS) return report;
    const rateLimited = events.some(
      (e) =>
        e.type === "turn.failed" && JSON.stringify(e.data).includes("RateLimit")
    );
    if (rateLimited) {
      report.followUps.push("rate limit: waited and continued");
      log(`  ${id}: rate limited, waiting ${RATE_LIMIT_WAIT_MS / 1000} s`);
      await sleep(RATE_LIMIT_WAIT_MS);
      await session.send(
        `The last step failed on a rate limit. Continue the Ingest of ${id} exactly where you stopped; do not redo finished steps.`
      );
    } else {
      report.followUps.push(problems.join(" "));
      log(
        `  ${id}: unfinished, following up: ${problems.join(" | ").slice(0, 400)}`
      );
      await session.send(
        `The Ingest of ${id} is not finished:\n- ${problems.join("\n- ")}\nFix these (read each Page again before editing it). If the INGEST line is already logged, do not log it again.`
      );
    }
  }
}

async function readNamespace(store: WikiStore): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  for (const path of await store.list("")) {
    if (path.startsWith("sources/")) continue;
    const page = await store.read(path);
    if (page) pages.set(path, page.body);
  }
  return pages;
}

async function embedStep(dir: string) {
  const { embedded, path } = await embedFixture(dir, gatewayEmbed);
  log(`embedded ${embedded} sections into ${path}`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      fixture: { type: "string", default: "full" },
      port: { type: "string", default: "2080" },
      ns: { type: "string" },
      resume: { type: "boolean", default: false },
      "redo-from": { type: "string" },
      "no-write": { type: "boolean", default: false },
      trace: { type: "boolean", default: false },
      "embed-only": { type: "boolean", default: false },
    },
  });
  const fixture = values.fixture as BuiltFixture;
  if (fixture !== "full" && fixture !== "base") {
    console.error("--fixture must be full or base");
    return 64;
  }
  const fixtureDir = resolve(ROOT, "fixtures", fixture);
  if (values["embed-only"]) {
    await embedStep(fixtureDir);
    return 0;
  }
  const namespace = values.ns ?? `build-${fixture}`;
  const plan = buildPlan(loadCorpus().manifest, fixture);
  const storeDir = resolve(
    process.env.WIKI_STORE_DIR ?? resolve(ROOT, ".wiki-store")
  );
  const snapshot = (id: string) =>
    resolve(storeDir, `${namespace}.snapshots`, id);
  const redo = values["redo-from"];
  if (redo) {
    if (!plan.includes(redo))
      throw new Error(`${redo} is not in the ${fixture} plan`);
    await rm(resolve(storeDir, namespace), { recursive: true, force: true });
    await cp(snapshot(redo), resolve(storeDir, namespace), { recursive: true });
  } else if (!values.resume)
    await seedNamespace({
      namespace,
      fixtureDir: resolve(ROOT, "fixtures/empty"),
      sourcesDir: resolve(ROOT, "corpus/sources"),
      force: true,
    });
  const held = await holdBackSources(
    resolve(storeDir, namespace, "sources"),
    plan
  );
  if (held.length) log(`held back ${held.length} Sources not in the plan`);
  const store = createWikiStore({ namespace });
  const port = Number(values.port);
  log(`building ${fixture} in namespace ${namespace}: ${plan.length} Sources`);
  const eve = await startEve(port, namespace, values.trace);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      stopEve(eve);
      process.exit(130);
    });
  const reports: Report[] = [];
  try {
    for (const id of plan) {
      if ((await ingested(store, id)).length === 0) {
        log(`${id}: already Ingested, skipped`);
        continue;
      }
      // The state before this Source, for --redo-from.
      await rm(snapshot(id), { recursive: true, force: true });
      await cp(resolve(storeDir, namespace), snapshot(id), { recursive: true });
      log(`${id}: Ingesting`);
      const report = await ingest(`http://127.0.0.1:${port}/eve/v1`, store, id);
      reports.push(report);
      log(
        `${id}: ${report.done ? "done" : "NOT FINISHED"} (${report.inputTokens} input tokens)`
      );
    }
  } finally {
    stopEve(eve);
  }
  const pages = await readNamespace(store);
  const problems = checkWiki(pages);
  const reportPath = resolve(
    ROOT,
    `.wiki-store/${namespace}.build-report.json`
  );
  await writeFile(reportPath, JSON.stringify({ reports, problems }, null, 2));
  log(`report: ${reportPath}`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  if (!values["no-write"]) {
    const dir = fixtureDir;
    // Keep the old cache: the embed step reuses every vector still current.
    const cache = await readFile(resolve(dir, CACHE_PATH), "utf8").catch(
      () => null
    );
    await rm(dir, { recursive: true, force: true });
    for (const [path, body] of pages) {
      await mkdir(dirname(resolve(dir, path)), { recursive: true });
      await writeFile(resolve(dir, path), body);
    }
    log(`wrote ${pages.size} Pages to fixtures/${fixture}`);
    if (cache !== null) {
      await mkdir(dirname(resolve(dir, CACHE_PATH)), { recursive: true });
      await writeFile(resolve(dir, CACHE_PATH), cache);
    }
    await embedStep(dir);
  }
  return problems.length || reports.some((r) => !r.done) ? 1 : 0;
}

main().then((code) => process.exit(code));
