// Runs in the browser too (chat bubbles): no Node built-ins here.

/** Where the read-only wiki browser serves a store path. */
export function wikiHref(path: string): string {
  return `/wiki/${path}`;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const LINK = /\]\(([^)\s]+)\)/g;
const CITATION = /\(src: ([a-z0-9][a-z0-9.-]*)\)/g;
const NOT_RELATIVE = /^([a-z][a-z0-9+.-]*:|\/|#)/i;

/**
 * Markdown ready for the wiki browser or a chat bubble: frontmatter split
 * off, Page-relative links resolved against `pagePath` (null for chat text,
 * whose links are already `/wiki/<path>`), and every `(src: <id>)` Citation
 * linked to its Source.
 */
export function linkPage(
  markdown: string,
  pagePath: string | null
): { frontmatter: string | null; body: string } {
  const match = FRONTMATTER.exec(markdown);
  const body = match ? markdown.slice(match[0].length) : markdown;
  const linked = body
    .replace(LINK, (whole, target: string) => {
      if (pagePath === null || NOT_RELATIVE.test(target)) return whole;
      const resolved = resolve(pagePath, target);
      return resolved === null ? whole : `](${wikiHref(resolved)})`;
    })
    .replace(
      CITATION,
      (_, id: string) => `([src: ${id}](${wikiHref(`sources/${id}`)}))`
    );
  return { frontmatter: match ? match[1] : null, body: linked };
}

/** `target` relative to the folder of `from`; null if it leaves the Wiki. */
function resolve(from: string, target: string): string | null {
  const parts = from.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") parts.push(segment);
    else if (parts.length === 0) return null;
    else parts.pop();
  }
  return parts.join("/");
}
