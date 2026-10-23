// A Page body read as Markdown for the Link table, in time linear in its
// length. `marked` is superlinear on some input, so it reads the body in
// bounded pieces: chunks of top-level blocks (MAX_CHUNK) and paragraphs in
// pieces (MAX_INLINE), each cut where no link or code span is open, and at
// most MAX_DEPTH container markers on one line. Only input no ordinary Page
// holds (a link open across 16,000 characters, a 1,000-character run with
// no whitespace outside brackets) is cut through a link.

import { Lexer, type Links, type Token, type Tokens } from "marked";

/**
 * Most characters `marked` reads at block level in one go: its block pass is
 * superlinear on a long paragraph, worst inside a list item (18,000
 * characters of one item's paragraph take seconds). A longer body is read in
 * chunks, cut between top-level blocks where it can be.
 */
const MAX_CHUNK = 4_000;

/** A chunk this long is cut at the next line even with a link open. */
const MAX_OPEN = 4 * MAX_CHUNK;

/**
 * Most container markers (`>`, `-`, `1.`) one line opens. `marked` recurses
 * once per marker, so a line of thousands overflows the stack or takes
 * quadratic time; markers past this depth are dropped.
 */
const MAX_DEPTH = 32;

/**
 * Most characters `marked` reads inline in one go. Its inline pass is
 * quadratic on some text (a long run of unclosed emphasis, many escapes), so
 * a longer paragraph is read in pieces of at most this size.
 */
const MAX_INLINE = 1_000;

/** The end of the container marker starting at `at`, or -1 if there is none. */
function markerEnd(line: string, at: number): number {
  let i = at;
  while (i < at + 3 && (line[i] === " " || line[i] === "\t")) i++;
  if (line[i] === ">") return line[i + 1] === " " ? i + 2 : i + 1;
  const space = (j: number) => line[j] === " " || line[j] === "\t";
  if ((line[i] === "-" || line[i] === "*" || line[i] === "+") && space(i + 1))
    return i + 2;
  let j = i;
  while (j < i + 9 && line[j] >= "0" && line[j] <= "9") j++;
  if (j > i && (line[j] === "." || line[j] === ")") && space(j + 1))
    return j + 2;
  return -1;
}

/** `line` with its container markers past `MAX_DEPTH` dropped. */
function shallow(line: string): string {
  let at = 0;
  for (let depth = 0; ; depth++) {
    const end = markerEnd(line, at);
    if (end < 0) return line;
    if (depth === MAX_DEPTH) {
      let last = end;
      for (let next = end; next >= 0; next = markerEnd(line, last)) last = next;
      return line.slice(0, at) + line.slice(last);
    }
    at = end;
  }
}

/** The brackets and parentheses open outside code, and the open code span's backtick run. */
type Open = { square: number; round: number; code: number };

/** `open` moved past `line`. */
function scan(line: string, open: Open): void {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "`") {
      let run = 1;
      while (line[i + run] === "`") run++;
      if (open.code === 0) open.code = run;
      else if (open.code === run) open.code = 0;
      i += run - 1;
    } else if (open.code > 0) continue;
    else if (c === "\\") i++;
    else if (c === "[") open.square++;
    else if (c === "]") open.square = Math.max(0, open.square - 1);
    else if (c === "(") open.round++;
    else if (c === ")") open.round = Math.max(0, open.round - 1);
  }
}

/**
 * `markdown` in chunks of about `MAX_CHUNK`, each read by `marked` on its
 * own. A cut goes before a top-level block that follows a blank line; inside
 * one longer block, before a line with no link or code span open across it.
 * A line indented four or more spaces would read as code at the top of a
 * chunk, so its chunk opens with a line of text it continues instead. Never
 * inside fenced code, an HTML comment or a raw `<pre>`-style block.
 */
function chunks(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let size = 0;
  let open: Open = { square: 0, round: 0, code: 0 };
  /** What closes the open fence or raw block, null outside one. */
  let closer: RegExp | null = null;
  let blank = true;
  for (const raw of markdown.split("\n")) {
    const line = shallow(raw);
    const empty = line.trim() === "";
    if (closer === null) {
      const shallowIndent = /^ {0,3}\S/.test(line);
      const balanced = open.square + open.round + open.code === 0;
      const at = blank ? shallowIndent : balanced;
      if (
        current.length > 0 &&
        !empty &&
        ((at && size + line.length > MAX_CHUNK) || size > MAX_OPEN)
      ) {
        out.push(current.join("\n"));
        current = shallowIndent ? [] : ["."];
        size = 0;
        open = { square: 0, round: 0, code: 0 };
      }
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence)
        closer = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
      else if (/^ {0,3}<!--/.test(line) && !line.slice(4).includes("-->"))
        closer = /-->/;
      else if (
        /^ {0,3}<(pre|script|style|textarea)(\s|>|$)/i.test(line) &&
        !/<\/(pre|script|style|textarea)>/i.test(line)
      )
        closer = /<\/(pre|script|style|textarea)>/i;
      if (empty) open = { square: 0, round: 0, code: 0 };
      else if (!fence) scan(line, open);
    } else if (closer.test(line)) closer = null;
    current.push(line);
    size += line.length + 1;
    blank = empty;
  }
  return [...out, current.join("\n")];
}

/**
 * Where to cut `text` so the first piece is at most `MAX_INLINE` long: the
 * last whitespace outside brackets, parentheses and code spans, so a link or
 * a Citation is never split; failing that, at the limit.
 */
function cutAt(text: string): number {
  let cut = MAX_INLINE;
  let square = 0;
  let round = 0;
  let code = 0;
  for (let i = 0; i < MAX_INLINE; i++) {
    const c = text[i];
    if (c === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      if (code === 0) code = run;
      else if (code === run) code = 0;
      i += run - 1;
    } else if (code > 0) continue;
    else if (c === "\\") i++;
    else if (c === "[") square++;
    else if (c === "]") square = Math.max(0, square - 1);
    else if (c === "(") round++;
    else if (c === ")") round = Math.max(0, round - 1);
    else if (/\s/.test(c) && square === 0 && round === 0) cut = i + 1;
  }
  return cut;
}

/** `text` in pieces of at most `MAX_INLINE`, cut by `cutAt`. */
function pieces(text: string): string[] {
  const out: string[] = [];
  while (text.length > MAX_INLINE) {
    const cut = cutAt(text);
    out.push(text.slice(0, cut));
    text = text.slice(cut);
  }
  return [...out, text];
}

/**
 * Every token under `tokens`, in document order. `marked`'s own walkTokens
 * is quadratic in the number of tokens and recursive; this is neither.
 */
function* everyToken(tokens: Token[]): Generator<Token> {
  const stack = [...tokens].reverse();
  for (let token = stack.pop(); token; token = stack.pop()) {
    yield token;
    const children: Token[] =
      token.type === "table"
        ? [
            ...(token as Tokens.Table).header,
            ...(token as Tokens.Table).rows.flat(),
          ].flatMap((cell) => cell.tokens)
        : token.type === "list"
          ? (token as Tokens.List).items
          : "tokens" in token && token.tokens
            ? token.tokens
            : [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

type Blocks = { tokens: Token[]; queue: Lexer["inlineQueue"] };

/** One chunk's block tokens, its definitions added to `links`; null if unreadable. */
function blockRead(chunk: string, links: Links): Blocks | null {
  const lexer = new Lexer();
  try {
    const tokens = lexer.blockTokens(chunk, []);
    // A reference definition counts once: the first one wins, as in Markdown.
    for (const [tag, link] of Object.entries(lexer.tokens.links))
      links[tag] ??= link;
    return { tokens, queue: lexer.inlineQueue };
  } catch {
    return null;
  }
}

/**
 * A Page body read as Markdown: every link's target (inline or reference
 * style, the definition anywhere in the body) and the prose text outside
 * code, where Citations count. Code spans, code blocks and backslash escapes
 * carry no Link. A chunk or piece `marked` cannot read carries none either;
 * the rest of the body still does.
 */
export function readBody(markdown: string): {
  prose: string;
  targets: string[];
} {
  const links: Links = {};
  const reads = chunks(markdown.replace(/\r\n?/g, "\n")).flatMap(
    (chunk) => blockRead(chunk, links) ?? []
  );
  const inline = new Lexer();
  Object.assign(inline.tokens.links, links);
  const tokens: Token[] = [];
  for (const read of reads) {
    tokens.push(...read.tokens);
    for (const { src, tokens: into } of read.queue)
      for (const piece of pieces(src))
        try {
          inline.inlineTokens(piece, into);
        } catch {
          // This piece carries no Links.
        }
  }
  const targets: string[] = [];
  const prose: string[] = [];
  for (const token of everyToken(tokens))
    if (token.type === "link") targets.push(token.href);
    else if (token.type === "text" && !("tokens" in token && token.tokens))
      prose.push(token.text);
  return { prose: prose.join("\n"), targets };
}
