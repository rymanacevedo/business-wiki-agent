// Regenerate the Corpus (Sources, Manifest, review note) from the Bible.
// Usage: bun run corpus:generate
import { defaultBible } from "../packages/corpus/bible";
import {
  CORPUS_DIR,
  generateCorpus,
  validateManifest,
  writeCorpus,
} from "../packages/corpus/index";

const corpus = generateCorpus(defaultBible);
const problems = validateManifest(
  corpus.manifest,
  corpus.sources.map((s) => s.file)
);
if (problems.length > 0) {
  console.error(
    `Manifest is inconsistent:\n${problems.map((p) => `  - ${p}`).join("\n")}`
  );
  process.exit(1);
}
writeCorpus(corpus);
console.log(
  `Wrote ${corpus.sources.length} Sources, manifest.json, and REVIEW.md to ${CORPUS_DIR}`
);
