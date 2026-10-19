import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { fileURLToPath } from "node:url";

const eveRoot = fileURLToPath(new URL("../..", import.meta.url));

// The wiki browser and the eve dev server it starts read the same local
// store as `bun run wiki:seed` (the repo's .wiki-store), whatever the cwd.
process.env.WIKI_STORE_DIR ??= `${eveRoot}.wiki-store`;

const nextConfig: NextConfig = {
  // The wiki browser imports the repo's packages/ from outside apps/web.
  turbopack: { root: eveRoot },
  outputFileTracingRoot: eveRoot,
  // Keep next dev from writing AGENTS.md and CLAUDE.md into apps/web.
  agentRules: false,
};

export default withEve(nextConfig, { eveRoot });
