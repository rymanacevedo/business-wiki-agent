import { maskSource } from "../../source-masking";
import { WikiPathError, type WikiStore } from "../../wiki-store";

/**
 * The Page or Source a `/wiki/[...path]` route names: the Index for the
 * root, a Source by bare id (Citations carry no extension), null otherwise.
 * A Source body is masked exactly as `read_source` hands it to Clerk.
 */
export async function openWikiPage(
  store: WikiStore,
  segments: string[]
): Promise<{ path: string; body: string } | null> {
  let path: string;
  try {
    path = segments.map((segment) => decodeURIComponent(segment)).join("/");
  } catch {
    return null;
  }
  const candidates =
    path === ""
      ? ["index.md"]
      : /\.(md|txt)$/.test(path)
        ? [path]
        : [`${path}.md`, `${path}.txt`];
  for (const candidate of candidates) {
    try {
      const entry = await store.read(candidate);
      if (entry)
        return {
          path: candidate,
          body: /^sources\//i.test(candidate)
            ? maskSource(entry.body)
            : entry.body,
        };
    } catch (error) {
      if (error instanceof WikiPathError) return null;
      throw error;
    }
  }
  return null;
}
