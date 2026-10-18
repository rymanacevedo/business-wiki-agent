/**
 * Restore a namespace to a fixture plus the Corpus Sources. For the
 * `wiki:seed` script and eval setup only; tools use the WikiStore in index.ts.
 */
export { seedNamespace, WikiSeedError, type SeedOptions } from "./lib/seed";
