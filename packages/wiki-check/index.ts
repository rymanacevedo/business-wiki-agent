/**
 * Standing consistency checks over a whole Wiki: for fixture tests and the
 * eval checks. `checkWiki(pages)` returns every problem found; `readWikiDir`
 * loads a fixture directory (or a local namespace) into the map it takes.
 */
export { checkWiki } from "./lib/check";
export { readWikiDir } from "./lib/read";
