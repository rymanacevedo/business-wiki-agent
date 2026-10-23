// The embedding cache (decisions #44, #48 items 6 to 8): one vector per
// section, persisted as `cache/embeddings.json` in the namespace.
//
// Entries are keyed by Page path, then section id, and carry the Page's
// content hash: sha256 hex of the body, computed here rather than taken
// from the store. The local backend's etag is that same hash, but a Blob
// etag is an MD5-ish quoted string, so a cache keyed by store etags and built
// from a local fixture would look stale on Blob for every Page.

import type { SectionHit } from "./bm25";
import type { Section } from "./sections";

/** The package owns the model, so the cache header always names what made the vectors. */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 512;
export const CACHE_PATH = "cache/embeddings.json";

/** Texts to vectors: the Gateway adapter, or a fake in tests. */
export type Embed = (texts: string[]) => Promise<number[][]>;

/** What the cache needs of a Page: its content hash and its sections. */
export type EmbeddablePage = {
  path: string;
  hash: string;
  sections: Section[];
};

type PageVectors = { hash: string; sections: Map<string, Float32Array> };
/** Page path to its content hash and section vectors. */
export type Vectors = Map<string, PageVectors>;

type CacheFile = {
  model: string;
  dimensions: number;
  pages: Record<string, { hash: string; sections: Record<string, string> }>;
};

// Vectors are stored as base64 little-endian float32: about a third of the
// size of JSON numbers, and exact for what a cosine needs.
function encode(vector: Float32Array): string {
  return Buffer.from(
    vector.buffer,
    vector.byteOffset,
    vector.byteLength
  ).toString("base64");
}

function decode(text: string): Float32Array {
  const bytes = new Uint8Array(Buffer.from(text, "base64"));
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
}

/**
 * The cache file's vectors. A missing or unreadable file, or a header naming
 * another model or dimension count, is an empty cache: every vector is stale.
 */
export function parseCache(body: string | null | undefined): Vectors {
  const vectors: Vectors = new Map();
  if (!body) return vectors;
  let file: CacheFile;
  try {
    file = JSON.parse(body) as CacheFile;
  } catch {
    return vectors;
  }
  if (
    file?.model !== EMBEDDING_MODEL ||
    file.dimensions !== EMBEDDING_DIMENSIONS ||
    typeof file.pages !== "object" ||
    file.pages === null
  )
    return vectors;
  for (const [path, page] of Object.entries(file.pages)) {
    if (typeof page?.hash !== "string" || typeof page.sections !== "object")
      continue;
    const sections = new Map<string, Float32Array>();
    for (const [id, text] of Object.entries(page.sections ?? {})) {
      if (typeof text !== "string") continue;
      const vector = decode(text);
      if (vector.length === EMBEDDING_DIMENSIONS) sections.set(id, vector);
    }
    vectors.set(path, { hash: page.hash, sections });
  }
  return vectors;
}

/** The cache file body, keys sorted so a rebuild with the same vectors is byte-identical. */
export function serialiseCache(vectors: Vectors): string {
  const pages: CacheFile["pages"] = {};
  for (const path of [...vectors.keys()].sort()) {
    const page = vectors.get(path)!;
    const sections: Record<string, string> = {};
    for (const id of [...page.sections.keys()].sort())
      sections[id] = encode(page.sections.get(id)!);
    pages[path] = { hash: page.hash, sections };
  }
  const file: CacheFile = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    pages,
  };
  return `${JSON.stringify(file, null, 1)}\n`;
}

const current = (vectors: Vectors, page: EmbeddablePage, id: string) => {
  const entry = vectors.get(page.path);
  return entry?.hash === page.hash ? entry.sections.get(id) : undefined;
};

/** Sections with no vector for their Page's current content, by path then id. */
export function missing(
  vectors: Vectors,
  pages: Iterable<EmbeddablePage>
): Section[] {
  const out: Section[] = [];
  for (const page of pages)
    for (const section of page.sections)
      if (!current(vectors, page, section.id)) out.push(section);
  return out.sort((a, b) =>
    a.path < b.path
      ? -1
      : a.path > b.path
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
  );
}

/** Call `embed` and check it answered one vector of the right size per text. */
export async function embedChecked(
  embed: Embed,
  texts: string[]
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const out = await embed(texts);
  if (!Array.isArray(out) || out.length !== texts.length)
    throw new Error(
      `embed returned ${out?.length} vectors for ${texts.length} texts`
    );
  return out.map((v) => {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS)
      throw new Error(
        `embed returned a vector of ${v?.length} dimensions, not ${EMBEDDING_DIMENSIONS}`
      );
    return Float32Array.from(v);
  });
}

/**
 * Record fresh vectors and drop everything that no longer describes the Wiki:
 * Pages gone, Pages whose content changed, sections that no longer exist.
 */
export function record(
  vectors: Vectors,
  pages: Map<string, EmbeddablePage>,
  sections: Section[],
  fresh: Float32Array[]
): void {
  for (const [path, entry] of vectors) {
    const page = pages.get(path);
    if (!page || page.hash !== entry.hash) {
      vectors.delete(path);
      continue;
    }
    const ids = new Set(page.sections.map((s) => s.id));
    for (const id of entry.sections.keys())
      if (!ids.has(id)) entry.sections.delete(id);
  }
  sections.forEach((section, i) => {
    const page = pages.get(section.path);
    if (!page) return;
    let entry = vectors.get(page.path);
    if (!entry)
      vectors.set(
        page.path,
        (entry = { hash: page.hash, sections: new Map() })
      );
    entry.sections.set(section.id, fresh[i]);
  });
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** The `n` sections closest to `query`, among those with a current vector; ties by id. */
export function nearest(
  vectors: Vectors,
  pages: Iterable<EmbeddablePage>,
  query: Float32Array,
  n: number
): SectionHit[] {
  const hits: SectionHit[] = [];
  for (const page of pages)
    for (const section of page.sections) {
      const vector = current(vectors, page, section.id);
      if (vector) hits.push({ section, score: cosine(query, vector) });
    }
  return hits
    .sort(
      (x, y) => y.score - x.score || x.section.id.localeCompare(y.section.id)
    )
    .slice(0, n);
}
