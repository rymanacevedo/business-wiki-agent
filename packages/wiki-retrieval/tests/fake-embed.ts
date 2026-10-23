import type { Embed } from "../index";

// A deterministic stand-in for the Gateway: bag-of-words vectors over 512
// hashed dimensions, where a few words fold into one concept, so the two
// semantic rows' wording lands close to Pages that share no word with it.
const CONCEPTS: Record<string, string> = {
  ac: "hvac-tool",
  diagnostic: "hvac-tool",
  kit: "hvac-tool",
  gauge: "hvac-tool",
  manifold: "hvac-tool",
  stopping: "brakes",
  brake: "brakes",
  rotor: "brakes",
  pads: "brakes",
  garage: "garage",
  auto: "garage",
  fleet: "garage",
};
const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "did",
  "what",
  "us",
  "we",
  "our",
  "src",
]);
export const DIMENSIONS = 512;

function hash(word: string): number {
  let h = 2166136261;
  for (const c of word) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % DIMENSIONS;
}

export function fakeVector(text: string): number[] {
  const v = Array.from({ length: DIMENSIONS }, () => 0);
  const words = text
    .toLowerCase()
    .replace(/a\/c/g, "ac")
    .split(/[^a-z0-9]+/);
  for (const w of words) {
    if (w.length < 2 || STOP.has(w)) continue;
    const concept = CONCEPTS[w];
    // A concept word counts heavily toward its concept, lightly as itself.
    if (concept) v[hash(concept)] += 4;
    v[hash(w)] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export const fakeEmbed: Embed = async (texts) => texts.map(fakeVector);

/** The fake, counting the texts it embeds: queries (by the given set) apart from sections. */
export function countingEmbed(queries: Set<string>) {
  const counts = {
    calls: 0,
    queries: 0,
    sections: 0,
    sectionTexts: [] as string[],
  };
  const embed: Embed = async (texts) => {
    counts.calls++;
    for (const t of texts)
      if (queries.has(t)) counts.queries++;
      else {
        counts.sections++;
        counts.sectionTexts.push(t);
      }
    return fakeEmbed(texts);
  };
  return { counts, embed };
}

export const throwingEmbed: Embed = async () => {
  throw new Error("Gateway unavailable");
};
