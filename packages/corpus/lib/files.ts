import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { GeneratedCorpus } from "./generate";
import type { Manifest } from "./types";

/** The committed Corpus at the repo root. */
export const CORPUS_DIR = resolve(__dirname, "../../../corpus");

export interface CommittedCorpus {
  manifest: Manifest;
  /** Source file name -> text. */
  bodies: Map<string, string>;
  review: string;
}

/** Read the committed Corpus: Manifest, every Source under `sources/`, and the review note. */
export function loadCorpus(dir: string = CORPUS_DIR): CommittedCorpus {
  const manifest = JSON.parse(
    readFileSync(join(dir, "manifest.json"), "utf8")
  ) as Manifest;
  const bodies = new Map<string, string>();
  for (const f of readdirSync(join(dir, "sources")).sort()) {
    bodies.set(f, readFileSync(join(dir, "sources", f), "utf8"));
  }
  return {
    manifest,
    bodies,
    review: readFileSync(join(dir, "REVIEW.md"), "utf8"),
  };
}

/** Replace the Corpus in `dir` with a generated one. */
export function writeCorpus(
  corpus: GeneratedCorpus,
  dir: string = CORPUS_DIR
): void {
  rmSync(join(dir, "sources"), { recursive: true, force: true });
  mkdirSync(join(dir, "sources"), { recursive: true });
  for (const s of corpus.sources)
    writeFileSync(join(dir, "sources", s.file), s.body);
  writeFileSync(
    join(dir, "manifest.json"),
    `${JSON.stringify(corpus.manifest, null, 2)}\n`
  );
  writeFileSync(join(dir, "REVIEW.md"), corpus.review);
}
