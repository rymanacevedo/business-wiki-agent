import { PageEditError } from "./apply";
import { splitPage, topLevelKeys } from "./frontmatter";

/*
 * The guard reads a Profile or Obligation Page line by line: a heading opens
 * a section, an unindented `- **Label**: value` line is a fact, an indented
 * `- ` line is a sub-bullet. The Owner reads the same Page rendered. Any
 * Markdown construct that makes the two readings disagree could hide the old
 * fact from the Owner while the guard still sees it, or make a kept fact line
 * render as something other than a current fact. So these Pages hold plain
 * Markdown only, and every construct below is refused:
 *
 * - raw HTML: comments, tags, processing instructions, CDATA, autolinks;
 * - HTML entities (`&#73;`, `&lt;`), which can spoof a label or a tag;
 * - invisible characters: zero-width spaces and joiners, soft hyphens,
 *   bidirectional controls, the BOM;
 * - fenced code blocks, and any indented line that is not a `- ` sub-bullet
 *   directly under a bullet (indented code, a paragraph inside a bullet);
 * - a line directly under a bullet that is not a bullet or a heading: it
 *   renders as part of that bullet (a lazy continuation);
 * - blockquotes, tables, link reference and footnote definitions;
 * - `$$` display math, which the wiki browser renders as LaTeX;
 * - setext headings (a line of `=` or `-` under text);
 * - list markers other than `- ` and one space (`*`, `+`, `1.`, `1)`, `-`
 *   and a tab or five spaces), headings inside a bullet, and `#` runs
 *   longer than six;
 * - indentation by anything but spaces (a tab, a non-breaking space), and a
 *   carriage return inside a line (a line break the guard does not see).
 *
 * Inline code spans are text: what is inside one is shown as written.
 */

const HOW =
  "Profile and Obligation Pages hold plain Markdown only: `#` headings, fact lines `- **Label**: value (src: <source-id>)`, " +
  "`- ` sub-bullets indented two spaces directly under a bullet, and plain paragraphs after a blank line. " +
  "Write the fact as a plain line. To change or retire a fact use change_fact; for a Source that disagrees write the Schema's Conflict line; " +
  "to keep an old value visible, leave its line and add a dated `- ` line under `## History`.";

const fail = (path: string, problem: string): never => {
  throw new PageEditError(`${path} is not a valid Page: ${problem}. ${HOW}`);
};

/** A line with its inline code spans removed: their content is literal text. */
const outsideCode = (line: string) =>
  line.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, "");

const HTML = /<(?:[A-Za-z]|\/|!|\?)/;
const ENTITY = /&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);/;
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;
const BLOCKQUOTE = /^ {0,3}>/;
const DEFINITION = /^ {0,3}\[[^\]]+\]:/;
const TABLE_ROW = /^\s*\|/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const SETEXT = /^ {0,3}(?:=+|-+)\s*$/;
const OTHER_MARKER = /^ {0,3}(?:[*+]|\d{1,9}[.)])(?:\s|$)/;
// "-" then a tab, or five or more spaces: the bullet's text starts as code.
const ODD_BULLET = /^\s*-(?:\t| {5,})/;
const LONE_CR = /\r(?!$)/;
// Display math in the wiki browser (Streamdown's math plugin): `$$` opens a
// block whose lines render as LaTeX, where `\phantom` hides them.
const MATH = /\$\$/;
const BULLET = /^(\s*)- /;
const HEADING = /^#{1,6}(?:\s|$)/;
const HEADING_IN_BULLET = /^\s*-\s+#{1,6}(?:\s|$)/;
const LONG_HEADING = /^ {0,3}#{7,}/;

/**
 * Throws PageEditError when a Profile or Obligation Page holds a Markdown
 * construct that could hide a line or make a fact line render as something
 * other than a current fact. Other Pages are not checked: a summary may
 * quote a Source's HTML.
 */
export function validateFactText(path: string, page: string): void {
  const { frontmatter, body } = splitPage(page);
  const kind = topLevelKeys(frontmatter).get("kind");
  const held =
    kind === "profile" ||
    kind === "obligation" ||
    path === "profile.md" ||
    path.startsWith("obligations/");
  if (!held) return;

  let previous = "";
  for (const line of body) {
    const found = (what: string) =>
      fail(path, `${what} (found "${line.trim()}")`);
    const text = outsideCode(line);
    if (LONE_CR.test(line))
      found(
        "a carriage return inside a line renders as a line break the Page's lines do not show"
      );
    if (INVISIBLE.test(line))
      found(
        "it contains an invisible character (zero-width, soft hyphen, or direction control), which can hide or spoof text"
      );
    if (HTML.test(text))
      found(
        "raw HTML (a tag, an `<!-- comment -->`, or an `<autolink>`) can hide a line; write a link as [text](url)"
      );
    if (MATH.test(text))
      found(
        "`$$` opens display math, which renders its lines as LaTeX; write amounts with one $"
      );
    if (ENTITY.test(text))
      found(
        "an HTML entity (such as `&#73;` or `&lt;`) can spoof a label or hide text; write the character itself"
      );
    if (FENCE.test(line))
      found("a fenced code block turns the lines in it into code, not facts");
    if (BLOCKQUOTE.test(line))
      found("a blockquote turns its lines into a quotation, not facts");
    if (DEFINITION.test(line))
      found(
        "a link reference or footnote definition is not shown when the Page is rendered"
      );
    if (TABLE_ROW.test(line) || TABLE_DELIMITER.test(line))
      found("a table is not a fact line, and the guard cannot read its cells");
    if (previous.trim() && SETEXT.test(line) && !BULLET.test(line))
      found(
        "a line of = or - directly under text makes that text a setext heading, opening a new section; leave a blank line before a --- rule, and write headings with #"
      );
    if (OTHER_MARKER.test(line) || ODD_BULLET.test(line))
      found(
        "write every bullet as `- ` and one space, not `*`, `+`, a number, a tab, or more spaces"
      );
    if (HEADING_IN_BULLET.test(line) || LONG_HEADING.test(line))
      found(
        "a heading goes on its own line with one to six #, never inside a bullet"
      );

    const indent = /^\s*/.exec(line)![0];
    if (line.trim() && /[^ ]/.test(indent))
      found(
        "indent with spaces only: a tab or a non-breaking space renders differently from how the line reads"
      );
    if (line.trim() && indent) {
      const above = BULLET.exec(previous);
      if (!BULLET.test(line) || !above || indent.length > above[1].length + 4)
        found(
          "an indented line must be a `- ` sub-bullet directly under a bullet (no blank line between, two spaces deeper, no tabs); other indented text renders as code or as part of the bullet above"
        );
    } else if (
      line.trim() &&
      BULLET.test(previous) &&
      !BULLET.test(line) &&
      !HEADING.test(line)
    )
      found(
        "a line directly under a bullet continues that bullet when rendered; make it its own `- ` line, or leave a blank line before a paragraph"
      );
    previous = line;
  }
}
