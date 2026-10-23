// Pages to sections, the unit of ranking (research #45, section 3).

import { splitPage } from "../../page-edits";
import { readFrontmatter, type Frontmatter } from "./frontmatter";
import { tokenise } from "./tokens";

export type Section = {
  /** `<path>#<heading slug>-<ordinal>`; the opening section's slug is `top`. */
  id: string;
  path: string;
  /** The `##` heading; undefined for the Page's opening section. */
  heading?: string;
  /** Excerpt candidates in document order: a fact line with its continuation is one line. */
  lines: string[];
  /** What BM25 scores: the Page title, the heading, then the lines. */
  text: string;
};

const MAX_TOKENS = 300;
/** Join indented continuation lines onto the line above; drop blank lines. */
function factLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s+\S/.test(line) && out.length > 0)
      out[out.length - 1] += ` ${line.trim()}`;
    else out.push(line.trim());
  }
  return out;
}

const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";

type Draft = { heading?: string; lines: string[] };

/** Split at the line boundary nearest the token midpoint until every part fits. */
function fit(draft: Draft, title: string): Draft[] {
  const counts = draft.lines.map((line) => tokenise(line).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const overhead = tokenise(`${title}\n${draft.heading ?? ""}`).length;
  if (total + overhead <= MAX_TOKENS || draft.lines.length < 2) return [draft];
  let best = 1;
  let running = 0;
  let bestGap = Infinity;
  for (let i = 1; i < draft.lines.length; i++) {
    running += counts[i - 1];
    const gap = Math.abs(total / 2 - running);
    if (gap < bestGap) [best, bestGap] = [i, gap];
  }
  return [
    ...fit({ ...draft, lines: draft.lines.slice(0, best) }, title),
    ...fit({ ...draft, lines: draft.lines.slice(best) }, title),
  ];
}

/**
 * A Page's sections: the opening section carries the frontmatter facts and
 * any lines before the first `##`; every `##` heading opens a section (empty
 * ones are dropped); a leading `# Title` is the Page heading, not a boundary.
 */
export function sectionise(path: string, page: string): Section[] {
  const { frontmatter, body } = splitPage(page);
  return sectionsOf(path, readFrontmatter(frontmatter), body);
}

/** `sectionise` over a Page already split and its frontmatter already read. */
export function sectionsOf(
  path: string,
  frontmatter: Frontmatter,
  body: string[]
): Section[] {
  const title = frontmatter.value("title") ?? path;
  const drafts: Draft[] = [];
  let current: Draft = { lines: [] };
  let opening = true;
  for (const line of body) {
    if (
      opening &&
      line.startsWith("# ") &&
      current.lines.every((l) => !l.trim())
    )
      continue;
    if (line.startsWith("## ")) {
      drafts.push(current);
      opening = false;
      current = { heading: line.slice(3).trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  drafts.push(current);

  const ordinals = new Map<string, number>();
  const sections: Section[] = [];
  drafts.forEach((draft, i) => {
    const lines =
      i === 0
        ? [...frontmatter.facts, ...factLines(draft.lines)]
        : factLines(draft.lines);
    if (i > 0 && lines.length === 0) return;
    for (const part of fit({ heading: draft.heading, lines }, title)) {
      const key = draft.heading === undefined ? "top" : slug(draft.heading);
      const n = ordinals.get(key) ?? 0;
      ordinals.set(key, n + 1);
      sections.push({
        id: `${path}#${key}-${n}`,
        path,
        heading: part.heading,
        lines: part.lines,
        text: [title, part.heading ?? "", ...part.lines].join("\n"),
      });
    }
  });
  return sections;
}
