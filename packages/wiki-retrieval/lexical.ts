/**
 * The lexical primitives behind `createRetrieval`, exposed for the tests and
 * the offline bench. Tools use `index.ts`.
 */
export { tokenise } from "./lib/tokens";
export { sectionise, type Section } from "./lib/sections";
