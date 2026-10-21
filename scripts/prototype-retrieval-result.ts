// PROTOTYPE, throwaway. Answers wayfinder ticket #47: what does one retrieval
// result look like, and is it the right size and shape for the model's next
// `read_page`? Lexical entry (the BM25 from research #45) plus one hop along
// the four Link kinds decided in #46, rendered two ways with size counts.
// No embeddings, no store, no cache: reads a fixture directory straight off
// disk. Nothing here is production code.
//
// Usage: bun scripts/prototype-retrieval-result.ts [--fixture full]
//          [--kind obligation] [--debug] ["query one" "query two" ...]
// With no queries it runs the five Queries the ticket asks for.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Pages

type Page = {
  path: string;
  title: string;
  kind: string;
  status: string;
  frontmatter: string[];
  body: string[];
  fmFacts: string[];
};

const EXCLUDED = new Set(["index.md", "log.md", "SCHEMA.md"]);

function walk(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, root));
    else if (name.endsWith(".md")) out.push(relative(root, full));
  }
  return out.sort();
}

function splitPage(page: string): { frontmatter: string[]; body: string[] } {
  const lines = page.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter: [], body: lines };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { frontmatter: lines.slice(1), body: [] };
  return { frontmatter: lines.slice(1, end), body: lines.slice(end + 1) };
}

const FM_KEYS =
  /^(title|kind|status|flags|entity|obligation|due|counterparty|category|recurs|superseded_by|done_on|sources):\s*(.*)$/;
const FM_EXPENSE =
  /^\s+(vendor|date|amount|document|status|due|evidence):\s*(.*)$/;

function fmValue(fm: string[], key: string): string | null {
  const line = fm.find((l) => new RegExp(`^\\s*${key}:`).test(l));
  if (!line) return null;
  const value = line.slice(line.indexOf(":") + 1).trim();
  return value === "" || value === "null" || value === "[]" ? null : value;
}

function loadPages(dir: string): Map<string, Page> {
  const pages = new Map<string, Page>();
  for (const path of walk(dir)) {
    if (EXCLUDED.has(path) || path.startsWith("sources/")) continue;
    const { frontmatter, body } = splitPage(
      readFileSync(join(dir, path), "utf8")
    );
    const fmFacts: string[] = [];
    for (const l of frontmatter) {
      const m = FM_KEYS.exec(l) ?? FM_EXPENSE.exec(l);
      if (m && m[2] && m[2] !== "[]" && m[2] !== "null")
        fmFacts.push(`${m[1]}: ${m[2]}`);
    }
    pages.set(path, {
      path,
      title: fmValue(frontmatter, "title") ?? path,
      kind: fmValue(frontmatter, "kind") ?? "?",
      status: fmValue(frontmatter, "status") ?? "?",
      frontmatter,
      body,
      fmFacts,
    });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Sections and tokens (research #45, reproduced)

const STOP = new Set(
  "a an and are as at be by do does did for from how in is it its of on or our the to was we what when which who whom why with you your src".split(
    " "
  )
);
const MONTHS =
  "january february march april may june july august september october november december".split(
    " "
  );
function normaliseQuery(q: string): string {
  return q.replace(
    new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "gi"),
    (_, m, y) =>
      `${y}-${String(MONTHS.indexOf(m.toLowerCase()) + 1).padStart(2, "0")}`
  );
}
const TOKEN =
  /\d+(?:\.\d+)?(?:-[\p{L}\p{N}]+)*|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
function tokenise(text: string): string[] {
  const norm = text.toLowerCase().replace(/(?<=\d),(?=\d{3}\b)/g, "");
  const out: string[] = [];
  for (const m of norm.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok.length < 2 || STOP.has(tok)) continue;
    out.push(tok);
    if (tok.includes("-")) {
      for (const p of tok.split("-"))
        if (p.length >= 2 && !STOP.has(p)) out.push(p);
      const ym = /^(\d{4}-\d{2})-\d{2}/.exec(tok);
      if (ym) out.push(ym[1]);
    }
  }
  return out;
}

type Section = {
  id: string;
  path: string;
  heading: string;
  text: string;
  /** Excerpt candidates: a fact line with its indented continuation is one. */
  lines: string[];
  /** Body-only excerpt candidates (frontmatter facts other than title/sources). */
  factLines: string[];
  /** Pages this section's own lines cite or link to (for --links section). */
  targets: Set<string>;
};

/** Join indented continuation lines onto the bullet above them. */
function factLines(content: string[]): string[] {
  const out: string[] = [];
  for (const line of content) {
    if (/^\s+\S/.test(line) && out.length > 0)
      out[out.length - 1] += " " + line.trim();
    else out.push(line.trim());
  }
  return out;
}

/** Pages a run of lines cites `(src: id)` or links `](../x.md)` to. */
function sectionTargets(path: string, lines: string[]): Set<string> {
  const text = lines.join("\n");
  const out = new Set<string>();
  for (const m of text.matchAll(CITATION)) out.add(`summaries/${m[1]}.md`);
  for (const m of text.matchAll(MDLINK)) {
    if (NOT_RELATIVE.test(m[1])) continue;
    const r = resolveRelative(path, m[1]);
    if (r) out.add(r);
  }
  return out;
}

function sectionise(page: Page): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const content = buf.filter((l) => l.trim());
    if (content.length === 0 && sections.length > 0) {
      buf = [];
      return;
    }
    const extra = sections.length === 0 ? page.fmFacts : [];
    const facts = extra.filter(
      (f) => !/^(title|sources|kind|status|flags):/.test(f)
    );
    sections.push({
      id: `${page.path}#${sections.length}`,
      path: page.path,
      heading,
      text: [page.title, heading, ...extra, ...content].join("\n"),
      lines: [...extra, ...factLines(content)],
      factLines: [...facts, ...factLines(content)],
      targets: sectionTargets(page.path, content),
    });
    buf = [];
  };
  for (const line of page.body) {
    if (/^##? /.test(line)) {
      if (
        line.startsWith("# ") &&
        sections.length === 0 &&
        buf.every((l) => !l.trim())
      ) {
        heading = line.slice(2);
        continue;
      }
      flush();
      heading = line.replace(/^#+ /, "");
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

class BM25 {
  N = 0;
  avgdl = 0;
  df = new Map<string, number>();
  docs: { sec: Section; tf: Map<string, number>; len: number }[] = [];
  constructor(
    sections: Section[],
    private k1 = 1.2,
    private b = 0.5
  ) {
    for (const sec of sections) {
      const toks = tokenise(sec.text);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ sec, tf, len: toks.length });
    }
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / this.N;
  }
  idf(t: string) {
    const n = this.df.get(t) ?? 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }
  terms(query: string) {
    return [...new Set(tokenise(normaliseQuery(query)))];
  }
  search(query: string) {
    const q = this.terms(query);
    const hits: { sec: Section; score: number; matched: string[] }[] = [];
    for (const d of this.docs) {
      let score = 0;
      const matched: string[] = [];
      for (const t of q) {
        const f = d.tf.get(t) ?? 0;
        if (!f) continue;
        matched.push(t);
        const norm = f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgdl);
        score += this.idf(t) * ((f * (this.k1 + 1)) / norm);
      }
      if (score > 0) hits.push({ sec: d.sec, score, matched });
    }
    return hits.sort(
      (a, b) => b.score - a.score || a.sec.id.localeCompare(b.sec.id)
    );
  }
}

// ---------------------------------------------------------------------------
// Links (decision #46): four kinds, both directions, summary Page as hub

type LinkKind = "cites" | "links" | "party" | "supersedes";
type Link = { from: string; to: string; kinds: Set<LinkKind> };

const CITATION = /\(src: ([a-z0-9][a-z0-9.-]*)\)/g;
const MDLINK = /\]\(([^)\s]+)\)/g;
const NOT_RELATIVE = /^([a-z][a-z0-9+.-]*:|\/|#)/i;

function resolveRelative(from: string, target: string): string | null {
  const parts = from.split("/").slice(0, -1);
  for (const segment of target.split("#")[0].split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") parts.push(segment);
    else if (parts.length === 0) return null;
    else parts.pop();
  }
  return parts.join("/");
}

function buildLinks(pages: Map<string, Page>): Link[] {
  const table = new Map<string, Link>();
  const add = (from: string, to: string | null, kind: LinkKind) => {
    if (!to || to === from || !pages.has(to)) return; // dangling and self dropped
    const key = `${from}\u0000${to}`;
    const link = table.get(key) ?? { from, to, kinds: new Set<LinkKind>() };
    link.kinds.add(kind);
    table.set(key, link);
  };
  for (const page of pages.values()) {
    const text = page.body.join("\n");
    for (const m of text.matchAll(CITATION))
      add(page.path, `summaries/${m[1]}.md`, "cites");
    const sources = fmValue(page.frontmatter, "sources");
    if (sources)
      for (const id of sources.replace(/[[\]]/g, "").split(/,\s*/))
        if (id.trim()) add(page.path, `summaries/${id.trim()}.md`, "cites");
    for (const m of text.matchAll(MDLINK)) {
      if (NOT_RELATIVE.test(m[1])) continue;
      add(page.path, resolveRelative(page.path, m[1]), "links");
    }
    for (const key of ["vendor", "counterparty"]) {
      const slug = fmValue(page.frontmatter, key);
      if (slug) add(page.path, `entities/${slug}.md`, "party");
    }
    const sup = fmValue(page.frontmatter, "superseded_by");
    if (sup)
      add(page.path, sup.endsWith(".md") ? sup : `${sup}.md`, "supersedes");
  }
  return [...table.values()];
}

/** Label as seen from the neighbour: what the neighbour is to the Match. */
const LABEL: Record<LinkKind, { forward: string; backward: string }> = {
  cites: { forward: "cited by", backward: "cites" },
  links: { forward: "linked from", backward: "links to" },
  party: { forward: "party of", backward: "names party" },
  supersedes: { forward: "supersedes", backward: "superseded by" },
};

// ---------------------------------------------------------------------------
// Retrieval: Matches, then the Neighbourhood

const MAX_PAGES = 8;
const MAX_MATCHES = 5;
const MAX_EXCERPT_LINES = 3;
const KIND_PRIOR = ["profile", "obligation", "summary", "entity", "ledger"];

type Via = { match: string; labels: string[] };
type ResultPage = {
  path: string;
  title: string;
  kind: string;
  status: string;
  role: "match" | "neighbourhood";
  heading?: string;
  excerpt?: string[];
  via?: Via[];
  score: number;
};
type Result = { pages: ResultPage[]; rung: "lexical"; terms: string[] };

function bestLines(
  sec: Section,
  terms: string[],
  idf: (t: string) => number,
  opts: Options
): string[] {
  const candidates = opts.excerpt === "all" ? sec.lines : sec.factLines;
  const scored = candidates.map((line, i) => {
    const toks = new Set(tokenise(line));
    const score = terms
      .filter((t) => toks.has(t))
      .reduce((s, t) => s + idf(t), 0);
    return { line, i, score };
  });
  const hit = scored
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const chosen = hit.slice(0, MAX_EXCERPT_LINES);
  if (opts.pad)
    for (const l of scored) {
      if (chosen.length >= MAX_EXCERPT_LINES) break;
      if (!chosen.includes(l)) chosen.push(l);
    }
  return chosen.sort((a, b) => a.i - b.i).map((l) => l.line);
}

type Options = {
  excerpt: "all" | "facts";
  links: "page" | "section";
  pad: boolean;
  /** count: decision #46 (distinct Matches reaching). weighted: sum of 1/outdegree(Match). */
  neighbours: "count" | "weighted";
  /** Drop neighbours scoring below this (weighted mode only). */
  floor: number;
  /** Drop Matches scoring below this fraction of the top Match. */
  matchFloor: number;
};

function retrieve(
  pages: Map<string, Page>,
  index: BM25,
  links: Link[],
  query: string,
  opts: Options,
  kind?: string
): Result {
  const terms = index.terms(query);
  const hits = index.search(query);
  // Collapse sections to Pages: max score, first (best) section wins.
  const matches: ResultPage[] = [];
  const matchSection = new Map<string, Section>();
  const seen = new Set<string>();
  const top = hits[0]?.score ?? 0;
  for (const h of hits) {
    if (h.score < top * opts.matchFloor) break;
    if (seen.has(h.sec.path)) continue;
    const page = pages.get(h.sec.path)!;
    if (kind && page.kind !== kind) continue;
    seen.add(page.path);
    matchSection.set(page.path, h.sec);
    matches.push({
      path: page.path,
      title: page.title,
      kind: page.kind,
      status: page.status,
      role: "match",
      heading: h.sec.heading,
      excerpt: bestLines(h.sec, terms, (t) => index.idf(t), opts),
      score: h.score,
    });
    if (matches.length === MAX_MATCHES) break;
  }
  if (matches.length === 0) return { pages: [], rung: "lexical", terms };

  // One hop, both directions, every reaching Match recorded once in via.
  // With --links section, a forward cites/links Link counts only when the
  // matched section itself carries it; party/supersedes are frontmatter, so
  // they are Page-level and always count.
  const matchRank = new Map(matches.map((m, i) => [m.path, i]));
  const neighbours = new Map<
    string,
    { via: Via[]; bestRank: number; weight: number }
  >();
  const outdegree = new Map<string, number>();
  for (const l of links) {
    outdegree.set(l.from, (outdegree.get(l.from) ?? 0) + 1);
    outdegree.set(l.to, (outdegree.get(l.to) ?? 0) + 1);
  }
  for (const link of links) {
    for (const [here, there, dir] of [
      [link.from, link.to, "forward"],
      [link.to, link.from, "backward"],
    ] as const) {
      const rank = matchRank.get(here);
      if (rank === undefined || matchRank.has(there)) continue;
      let kinds = [...link.kinds];
      if (opts.links === "section" && dir === "forward") {
        const sec = matchSection.get(here)!;
        kinds = kinds.filter((k) =>
          k === "cites" || k === "links" ? sec.targets.has(there) : true
        );
      }
      if (kinds.length === 0) continue;
      const labels = kinds.map((k) => LABEL[k][dir]);
      const n = neighbours.get(there) ?? { via: [], bestRank: rank, weight: 0 };
      const existing = n.via.find((v) => v.match === here);
      if (existing) existing.labels.push(...labels);
      else {
        n.via.push({ match: here, labels });
        n.weight += 1 / (outdegree.get(here) ?? 1);
      }
      n.bestRank = Math.min(n.bestRank, rank);
      neighbours.set(there, n);
    }
  }
  const ordered = [...neighbours.entries()]
    .map(([path, n]) => ({ path, ...n, page: pages.get(path)! }))
    .filter((n) => opts.neighbours === "count" || n.weight >= opts.floor)
    .sort(
      (a, b) =>
        (opts.neighbours === "weighted"
          ? b.weight - a.weight
          : b.via.length - a.via.length) ||
        a.bestRank - b.bestRank ||
        KIND_PRIOR.indexOf(a.page.kind) - KIND_PRIOR.indexOf(b.page.kind) ||
        a.path.localeCompare(b.path)
    )
    .slice(0, MAX_PAGES - matches.length)
    .map<ResultPage>((n) => ({
      path: n.path,
      title: n.page.title,
      kind: n.page.kind,
      status: n.page.status,
      role: "neighbourhood",
      via: n.via.sort(
        (a, b) => matchRank.get(a.match)! - matchRank.get(b.match)!
      ),
      score: n.weight,
    }));
  return { pages: [...matches, ...ordered], rung: "lexical", terms };
}

// ---------------------------------------------------------------------------
// Rendering: what the model would see. Two variants to react to.

const tokens = (s: string) => Math.ceil(s.length / 4);
const stripCitations = (s: string) =>
  s.replace(/\s*\(src: [^)]+\)/g, "").trim();
const clip = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;

/** A: Markdown, titles, labels in words, citations kept, neighbours as their own tier. */
function renderA(r: Result): string {
  if (r.pages.length === 0) return "No Page matches the query.";
  const out: string[] = [];
  const matches = r.pages.filter((p) => p.role === "match");
  const hood = r.pages.filter((p) => p.role === "neighbourhood");
  out.push(`## Matches (${matches.length})`);
  for (const p of matches) {
    out.push(`### ${p.path}`);
    out.push(
      `${p.title} · ${p.kind} · ${p.status}${p.heading ? ` · section "${p.heading}"` : ""}`
    );
    for (const line of p.excerpt ?? []) out.push(`> ${line}`);
  }
  if (hood.length) {
    out.push(`## Also linked (${hood.length})`);
    for (const p of hood) {
      const via = p
        .via!.map((v) => `${v.labels.join(", ")} ${v.match}`)
        .join("; ");
      out.push(`- ${p.path} · ${p.kind} · ${p.status}: ${via}`);
    }
  }
  return out.join("\n");
}

/** B: terse, one header line per Page, citations stripped, lines clipped, neighbours flat. */
function renderB(r: Result): string {
  if (r.pages.length === 0) return "No Page matches the query.";
  const out: string[] = [];
  for (const p of r.pages) {
    if (p.role === "match") {
      out.push(
        `${p.path} [${p.kind}, ${p.status}]${p.heading ? ` § ${p.heading}` : ""}`
      );
      for (const line of p.excerpt ?? [])
        out.push(`  ${clip(stripCitations(line), 160)}`);
    } else {
      const via = p
        .via!.slice(0, 2)
        .map((v) => `${v.labels[0]} ${v.match}`)
        .join("; ");
      const more = p.via!.length > 2 ? ` (+${p.via!.length - 2})` : "";
      out.push(`${p.path} [${p.kind}, ${p.status}] ← ${via}${more}`);
    }
  }
  return out.join("\n");
}

/** C: B's layout, citations kept, no clipping, one label per reaching Match. */
function renderC(r: Result): string {
  if (r.pages.length === 0) return "No Page matches the query.";
  const out: string[] = [];
  for (const p of r.pages) {
    if (p.role === "match") {
      out.push(
        `${p.path} [${p.kind}, ${p.status}]${p.heading ? ` § ${p.heading}` : ""}`
      );
      for (const line of p.excerpt ?? []) out.push(`  ${line}`);
    } else {
      out.push(
        `${p.path} [${p.kind}, ${p.status}] ← ${p.via!.map((v) => `${v.labels[0]} ${v.match}`).join("; ")}`
      );
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Driver

const DEFAULT_QUERIES = [
  "What did we buy from Harbor Hardware, and is any invoice to them unpaid?",
  "Which Obligations come from the Harborview lease?",
  "What do we owe Cascade Appliance Parts?",
  "When does our insurance renew, and who is the insurer?",
  "What is our EIN?",
];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fixture: { type: "string", default: "full" },
    kind: { type: "string" },
    debug: { type: "boolean", default: false },
    excerpt: { type: "string", default: "facts" }, // all | facts
    links: { type: "string", default: "section" }, // page | section
    "no-pad": { type: "boolean", default: false },
    neighbours: { type: "string", default: "count" }, // count | weighted
    floor: { type: "string", default: "0" },
    "match-floor": { type: "string", default: "0" },
    matrix: { type: "boolean", default: false },
  },
});
const opts: Options = {
  excerpt: values.excerpt === "all" ? "all" : "facts",
  links: values.links === "page" ? "page" : "section",
  pad: !values["no-pad"],
  neighbours: values.neighbours === "weighted" ? "weighted" : "count",
  floor: Number(values.floor),
  matchFloor: Number(values["match-floor"]),
};
const dir = resolve(import.meta.dirname, "../fixtures", values.fixture);
const pages = loadPages(dir);
const sections = [...pages.values()].flatMap(sectionise);
const index = new BM25(sections);
const links = buildLinks(pages);
const queries = positionals.length ? positionals : DEFAULT_QUERIES;

const kindCount = (ks: Set<LinkKind>) => [...ks].join("+");
const linkCensus = new Map<string, number>();
for (const l of links)
  linkCensus.set(
    kindCount(l.kinds),
    (linkCensus.get(kindCount(l.kinds)) ?? 0) + 1
  );
console.log(
  `# PROTOTYPE retrieval result · fixture ${values.fixture}: ${pages.size} Pages, ${sections.length} sections, ${links.length} Links (${[...linkCensus].map(([k, n]) => `${k} ${n}`).join(", ")})\n# options: ${JSON.stringify(opts)}\n`
);

if (values.matrix) {
  const configs: [string, Partial<Options>][] = [
    ["#46 rule, page links", { neighbours: "count", links: "page" }],
    ["#46 rule, section links", { neighbours: "count", links: "section" }],
    ["weighted, page links", { neighbours: "weighted", links: "page" }],
    [
      "weighted, page links, floor 0.2",
      { neighbours: "weighted", links: "page", floor: 0.2 },
    ],
    [
      "weighted, page, floor 0.2, match floor 0.33",
      { neighbours: "weighted", links: "page", floor: 0.2, matchFloor: 0.33 },
    ],
  ];
  for (const query of queries) {
    console.log(`\n${"=".repeat(78)}\nQUERY: ${query}`);
    for (const [name, patch] of configs) {
      const r = retrieve(
        pages,
        index,
        links,
        query,
        { ...opts, ...patch },
        values.kind
      );
      const m = r.pages.filter((p) => p.role === "match");
      const n = r.pages.filter((p) => p.role === "neighbourhood");
      console.log(`\n  [${name}] ${m.length} Matches, ${n.length} neighbours`);
      for (const p of n)
        console.log(
          `    ${p.score.toFixed(2)}  ${p.path}  ← ${p.via!.map((v) => `${v.labels.join("/")} ${v.match.split("/").pop()}`).join("; ")}`
        );
    }
  }
  process.exit(0);
}

for (const query of queries) {
  const r = retrieve(pages, index, links, query, opts, values.kind);
  console.log(
    `\n${"=".repeat(78)}\nQUERY: ${query}${values.kind ? `  (kind: ${values.kind})` : ""}\nterms: ${r.terms.join(" ")} · rung: ${r.rung}`
  );
  if (values.debug) {
    console.log("\n--- lexical top 10 sections");
    for (const h of index.search(query).slice(0, 10))
      console.log(
        `  ${h.score.toFixed(2)}  ${h.sec.id}  "${h.sec.heading}"  [${h.matched.join(" ")}]`
      );
  }
  const a = renderA(r);
  const b = renderB(r);
  console.log(
    `\n--- Variant A (${a.length} chars, ~${tokens(a)} tokens)\n${a}`
  );
  console.log(
    `\n--- Variant B (${b.length} chars, ~${tokens(b)} tokens)\n${b}`
  );
  const c = renderC(r);
  console.log(
    `\n--- Variant C (${c.length} chars, ~${tokens(c)} tokens)\n${c}`
  );
  // Does the hop earn its keep? Neighbours that plain lexical top-8 Pages would not have shown.
  const lexTop8 = [
    ...new Set(index.search(query).map((h) => h.sec.path)),
  ].slice(0, MAX_PAGES);
  const added = r.pages
    .filter((p) => p.role === "neighbourhood" && !lexTop8.includes(p.path))
    .map((p) => p.path);
  console.log(
    `\n--- Neighbourhood Pages that lexical top 8 alone would not show: ${added.length ? added.join(", ") : "none"}`
  );
  const fullRead = r.pages
    .filter((p) => p.role === "match")
    .map((p) => {
      const page = pages.get(p.path)!;
      const text = [...page.frontmatter, ...page.body].join("\n");
      return `${p.path} ${text.length} chars ~${tokens(text)} tokens`;
    });
  console.log(
    `\n--- read_page cost of each Match, for scale\n  ${fullRead.join("\n  ")}`
  );
}
