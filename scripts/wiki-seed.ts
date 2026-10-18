// Restore a WikiStore namespace to a named fixture plus the Corpus Sources.
// Usage: bun run wiki:seed --ns <namespace> --fixture <name> [--force]
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { seedNamespace, WikiSeedError } from "../packages/wiki-store/seed";

const FIXTURES_DIR = resolve(__dirname, "../fixtures");
const SOURCES_DIR = resolve(__dirname, "../corpus/sources");

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      ns: { type: "string" },
      fixture: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  if (!values.ns || !values.fixture || !/^[a-z0-9-]+$/.test(values.fixture)) {
    console.error(
      "Usage: bun run wiki:seed --ns <namespace> --fixture <name> [--force]"
    );
    return 64;
  }
  try {
    const { pages, sources } = await seedNamespace({
      namespace: values.ns,
      fixtureDir: resolve(FIXTURES_DIR, values.fixture),
      sourcesDir: SOURCES_DIR,
      force: values.force,
    });
    console.log(
      `Seeded ${values.ns} from fixture ${values.fixture}: ${pages} Pages, ${sources} Sources`
    );
    return 0;
  } catch (error) {
    if (!(error instanceof WikiSeedError)) throw error;
    console.error(error.message);
    return 1;
  }
}

main().then((code) => process.exit(code));
