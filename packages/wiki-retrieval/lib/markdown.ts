// A Page body read as Markdown for the Link table, in time linear in its
// length. `marked` is superlinear on some input, so it reads the body in
// bounded pieces: chunks of top-level blocks (MAX_CHUNK) and paragraphs in
// pieces (MAX_INLINE), each cut where no link or code span is open, and at
// most MAX_DEPTH container markers on one line. The chunker follows the
// quotes and list items each line sits in, as `marked` reads them, so no cut
// falls inside a code or raw HTML block at any depth, and a chunk cut inside
// a list item reopens it. Only input no ordinary Page holds (a link open
// across 16,000 characters, a 1,000-character run with no whitespace outside
// brackets) is cut through a link.

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

/**
 * What is open across a line: brackets and parentheses outside code, the
 * open code span's backtick run, and an inline HTML comment, which `marked`
 * reads to its `-->` or the end of the paragraph, links inside it included.
 */
type Open = { square: number; round: number; code: number; comment: boolean };

const closed = (): Open => ({ square: 0, round: 0, code: 0, comment: false });

const balanced = (open: Open) =>
  open.square + open.round + open.code === 0 && !open.comment;

/** Where the token of `text` at `i` ends, with `open` moved past it. */
function step(text: string, i: number, open: Open): number {
  if (open.comment) {
    if (!text.startsWith("-->", i)) return i + 1;
    open.comment = false;
    return i + 3;
  }
  const c = text[i];
  if (c === "`") {
    let run = 1;
    while (text[i + run] === "`") run++;
    if (open.code === 0) open.code = run;
    else if (open.code === run) open.code = 0;
    return i + run;
  }
  if (open.code > 0) return i + 1;
  if (c === "\\") return i + 2;
  if (text.startsWith("<!--", i)) {
    // `<!-->` and `<!--->` close at once.
    if (text.startsWith(">", i + 4)) return i + 5;
    if (text.startsWith("->", i + 4)) return i + 6;
    open.comment = true;
    return i + 4;
  }
  if (c === "[") open.square++;
  else if (c === "]") open.square = Math.max(0, open.square - 1);
  else if (c === "(") open.round++;
  else if (c === ")") open.round = Math.max(0, open.round - 1);
  return i + 1;
}

/** `open` moved past `line`. */
function scan(line: string, open: Open): void {
  for (let i = 0; i < line.length;) i = step(line, i, open);
}

/**
 * A container a line can sit in: a block quote, whose lines carry `>`, or a
 * list item, whose lines are indented to its content (`indent` columns past
 * the containers around it) or blank.
 */
type Container = { quote: true } | { quote: false; indent: number };

/** Where a path's quotes sit, computed once per path. */
const quotesOf = new WeakMap<
  readonly Container[],
  { first: number; last: number }
>();
function quotes(path: readonly Container[]): { first: number; last: number } {
  let found = quotesOf.get(path);
  if (!found) {
    found = {
      first: path.findIndex((c) => c.quote),
      last: path.reduce((at, c, i) => (c.quote ? i : at), -1),
    };
    quotesOf.set(path, found);
  }
  return found;
}

/**
 * `rest` past the container marker ending at `end`. `marked` takes one space
 * or one tab after `>` as part of the marker.
 */
const past = (rest: string, end: number) =>
  rest.slice(rest[end - 1] === ">" && rest[end] === "\t" ? end + 1 : end);

/** `text` past `columns` of leading whitespace (a tab to the next multiple of 4, its extra columns kept as spaces), or null if it is indented less. */
function dedent(text: string, columns: number): string | null {
  let col = 0;
  let i = 0;
  while (col < columns) {
    if (text[i] === " ") col++;
    else if (text[i] === "\t") col += 4 - (col % 4);
    else return null;
    i++;
  }
  // A tab that reaches past `columns` leaves its extra columns as indent.
  return " ".repeat(col - columns) + text.slice(i);
}

/**
 * A line that ends a list item even unindented inside its code, as `marked`
 * reads one: a list marker, heading, fence, quote, HTML start or thematic
 * break.
 */
const ENDS_ITEM =
  /^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|#{1,6}(?:[ \t]|$)|```|~~~|>|<(?:[a-z].*>|!--)|(?:(?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})$)/;

/**
 * Whether the line after one whose content is `rest` may continue a list
 * item unindented, as `marked` lets it: not after a blank line, indented
 * code, a fence opener, a heading or a thematic break.
 */
const lazyAfter = (rest: string) =>
  rest.trim() !== "" &&
  dedent(rest, 4) === null &&
  !/^ {0,3}(?:```|~~~|#{1,6}(?:[ \t]|$)|(?:(?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})$)/.test(
    rest
  );

/**
 * `line` past the containers of `path` it continues: `rest` is what follows
 * them, `depth` how many of them it continues. A blank line continues every
 * list item up to the first quote; a quote needs its `>`. With `lazy`, an
 * unindented line continues the list items it falls short of, as `marked`
 * reads code in a list item, unless a quote is inside them or it ends them.
 * The caller says whether the previous line allows that (`lazyAfter`).
 */
function enter(
  line: string,
  path: readonly Container[],
  lazy = false
): { rest: string; depth: number } {
  if (line.trim() === "") {
    const { first } = quotes(path);
    return { rest: "", depth: first < 0 ? path.length : first };
  }
  let rest = line;
  for (let depth = 0; depth < path.length; depth++) {
    const container = path[depth]!;
    if (container.quote) {
      const end = markerEnd(rest, 0);
      if (end < 0 || !rest.slice(0, end).includes(">")) return { rest, depth };
      rest = past(rest, end);
    } else {
      const next = dedent(rest, container.indent);
      if (next !== null) rest = next;
      else if (lazy && quotes(path).last < depth && !ENDS_ITEM.test(rest))
        return { rest: rest.trimStart(), depth: path.length };
      else return { rest, depth };
    }
  }
  return { rest, depth: path.length };
}

/**
 * Where a list item opened by the marker ending at `end` (past its one
 * space) puts its content, as `marked` reads it: past the spaces after the
 * marker when there are one to four and text follows, else one column in.
 */
function itemContent(
  rest: string,
  end: number
): { indent: number; rest: string } {
  // Columns from the end of the marker, a tab reaching the next multiple of 4.
  const marker = end - 1;
  let col = marker;
  let i = marker;
  for (; rest[i] === " " || rest[i] === "\t"; i++)
    col = rest[i] === " " ? col + 1 : col + 4 - (col % 4);
  const spaces = col - marker;
  if (i === rest.length || spaces > 4)
    return { indent: end, rest: rest.slice(end) };
  return { indent: marker + spaces, rest: rest.slice(i) };
}

/** `path` extended by the container markers `rest` opens, and what follows them. */
function open(
  rest: string,
  path: readonly Container[]
): { rest: string; path: readonly Container[] } {
  let end = markerEnd(rest, 0);
  if (end < 0) return { rest, path };
  const out = [...path];
  for (; end > 0; end = markerEnd(rest, 0)) {
    if (rest.slice(0, end).includes(">")) {
      out.push({ quote: true });
      rest = past(rest, end);
    } else {
      const item = itemContent(rest, end);
      out.push({ quote: false, indent: item.indent });
      rest = item.rest;
    }
  }
  return { rest, path: out };
}

/**
 * `rest` without its leading whitespace if that is at most three columns (a
 * tab to the next multiple of 4), as a block that may not be indented code
 * opens; null if it is indented further.
 */
function unindented(rest: string): string | null {
  let col = 0;
  let i = 0;
  for (; rest[i] === " " || rest[i] === "\t"; i++)
    col += rest[i] === " " ? 1 : 4 - (col % 4);
  return col <= 3 ? rest.slice(i) : null;
}

/**
 * What a raw block opened by `rest` (a line past its containers) is closed
 * by, or null if it opens none. Inside a paragraph `marked` lets a fence
 * interrupt indented up to three spaces but an HTML block only unindented.
 */
function rawCloser(
  rest: string,
  inParagraph: boolean
): ((rest: string) => boolean) | null {
  const text = unindented(rest);
  if (text === null) return null;
  const html = /<\/(pre|script|style|textarea)>/i;
  const fence = /^(`{3,}(?=[^`]*$)|~{3,})/.exec(text)?.[1];
  if (!fence && inParagraph && text !== rest) return null;
  if (fence) {
    const close = new RegExp(`^${fence[0]}{${fence.length},}\\s*$`);
    return (r) => {
      const t = unindented(r);
      return t !== null && close.test(t);
    };
  }
  if (text.startsWith("<!--") && !text.slice(4).includes("-->"))
    return (r) => r.includes("-->");
  if (/^<(pre|script|style|textarea)(\s|>|$)/i.test(text) && !html.test(text))
    return (r) => html.test(r);
  return null;
}

/**
 * A line of text inside `path`'s containers, to open a chunk cut inside a
 * list item so `marked` reads the rest of the item as the whole body would;
 * null when `path` holds no list item, or one too deeply indented to rebuild.
 */
function reopening(path: readonly Container[]): string | null {
  if (path.length > MAX_DEPTH || path.every((c) => c.quote)) return null;
  let line = "";
  for (const c of path) {
    if (c.quote) line += "> ";
    else {
      const before = Math.min(3, c.indent - 2);
      const after = c.indent - before - 1;
      if (before < 0 || after > 4) return null;
      line += `${" ".repeat(before)}-${" ".repeat(after)}`;
    }
  }
  return `${line}.`;
}

/** A line past its containers that opens or ends no paragraph: blank or a heading. */
const NOT_PROSE = /^(?:[ \t]*|[ \t]{0,3}#{1,6}(?:[ \t].*)?)$/;

/**
 * `markdown` in chunks of about `MAX_CHUNK`, each read by `marked` on its
 * own. A cut goes before a top-level block that follows a blank line; inside
 * one longer block, before a line with no link or code span open across it.
 * A chunk cut inside a list item opens with a line that reopens the item's
 * containers; elsewhere a line indented four or more spaces would read as
 * code at the top of a chunk, so unless it is indented code its chunk opens
 * with a line of text it continues instead. Never inside a raw block (fenced code, an HTML comment
 * or a `<pre>`-style block) at any container depth: a raw block remembers
 * the quotes and list items it opened in, and ends at its closer or at the
 * first line outside them.
 */
function chunks(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let size = 0;
  let spans = closed();
  /** The containers the previous line left open, as far as they are known. */
  let containers: readonly Container[] = [];
  /** The open raw block: the containers it sits in and what closes it. */
  let raw: {
    path: readonly Container[];
    closes: (rest: string) => boolean;
  } | null = null;
  let blank = true;
  /** The previous line past its containers was blank or a heading, or indented code. */
  let codeMayOpen = true;
  let inCode = false;
  /** Inside a raw block, the next line may continue its list items unindented. */
  let lazy = false;
  /** The chunk was cut mid-paragraph inside a list item and opened outside it. */
  let detached = false;
  for (const unbounded of markdown.split("\n")) {
    const line = shallow(unbounded);
    const empty = line.trim() === "";
    if (raw !== null) {
      const { rest, depth } = enter(line, raw.path, lazy);
      if (depth === raw.path.length) {
        lazy = lazyAfter(rest);
        if (raw.closes(rest)) {
          containers = raw.path;
          raw = null;
          codeMayOpen = true;
        }
        current.push(line);
        size += line.length + 1;
        blank = empty;
        continue;
      }
      // The line leaves a container the block sat in, which ends the block,
      // and no paragraph is open after it.
      containers = raw.path;
      raw = null;
      codeMayOpen = true;
    }
    const entered = enter(line, containers);
    const opened = empty
      ? { rest: "", path: containers.slice(0, entered.depth) }
      : open(entered.rest, containers.slice(0, entered.depth));
    const code: boolean =
      !empty && (codeMayOpen || inCode) && dedent(opened.rest, 4) !== null;
    const shallowIndent = /^ {0,3}\S/.test(line);
    const at = blank ? shallowIndent : balanced(spans);
    // `marked` reads a list item's lines one at a time, so a paragraph that
    // an HTML block may only interrupt unindented is one outside list items.
    const inParagraph = !codeMayOpen && opened.path.at(-1)?.quote !== false;
    const closes = code ? null : rawCloser(opened.rest, inParagraph);
    const reopen = empty ? null : reopening(containers.slice(0, entered.depth));
    // The line opens a block of its own rather than continuing a paragraph.
    const block =
      !empty &&
      (code || codeMayOpen || closes !== null || ENDS_ITEM.test(opened.rest));
    if (!empty && reopen === null) detached = false;
    if (
      current.length > 0 &&
      !empty &&
      ((at && size + line.length > MAX_CHUNK) ||
        size > MAX_OPEN ||
        (detached && reopen !== null && block && balanced(spans)))
    ) {
      out.push(current.join("\n"));
      // Mid-paragraph in a list item, the chunk opens outside it, where a
      // long paragraph reads in linear time, until the next block in the
      // item, which opens a chunk back inside it.
      detached = reopen !== null && !block;
      // A cut inside an inline comment (forced: it blocks the others)
      // reopens it, so the rest of it is still no Link.
      const comment = spans.comment;
      current = comment
        ? [`${reopen ?? "."} <!--`]
        : code
          ? []
          : reopen && block
            ? [reopen]
            : shallowIndent && !detached
              ? []
              : ["."];
      size = 0;
      spans = { ...closed(), comment };
    }
    containers =
      empty && entered.depth === containers.length ? containers : opened.path;
    if (closes) {
      raw = { path: containers, closes };
      lazy = lazyAfter(opened.rest);
    }
    if (empty) spans = closed();
    // A raw block's opener is part of the block: nothing in it stays open.
    else if (!code && !closes) scan(line, spans);
    inCode = code || (inCode && empty);
    codeMayOpen = code || NOT_PROSE.test(opened.rest);
    current.push(line);
    size += line.length + 1;
    blank = empty;
  }
  return [...out, current.join("\n")];
}

/**
 * Where to cut `text` so the first piece is at most `MAX_INLINE` long: the
 * last whitespace outside brackets, parentheses, code spans and comments, so
 * a link or a Citation is never split; failing that, at the limit. `comment`
 * says whether an inline comment is open at the cut.
 */
function cutAt(text: string): { cut: number; comment: boolean } {
  const open = closed();
  let cut = MAX_INLINE;
  let comment = true;
  let i = 0;
  while (i < MAX_INLINE) {
    if (/\s/.test(text[i]!) && balanced(open)) {
      cut = i + 1;
      comment = false;
    }
    i = step(text, i, open);
  }
  // No clean cut: the limit, inside whatever is open there.
  if (cut === MAX_INLINE) {
    const at = closed();
    for (let j = 0; j < MAX_INLINE;) j = step(text, j, at);
    comment = at.comment;
  }
  return { cut, comment };
}

/**
 * `text` in pieces of at most `MAX_INLINE`, cut by `cutAt`. A piece cut
 * inside an inline comment opens with `<!--`, so it stays a comment.
 */
function pieces(text: string): string[] {
  const out: string[] = [];
  while (text.length > MAX_INLINE) {
    const { cut, comment } = cutAt(text);
    out.push(text.slice(0, cut));
    text = (comment ? "<!--" : "") + text.slice(cut);
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
