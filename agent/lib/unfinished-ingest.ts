import type { WikiStore } from "../../packages/wiki-store";
import { declinedThisTurn } from "./declined";
import { ingestProblems } from "./ingest-check";
import {
  ingestsLoggedThisTurn,
  proposedPages,
  sourcesReadThisTurn,
} from "./sequence";

/** Open items named in the note; the INGEST gate gives the full list. */
const LISTED = 3;

/**
 * What a model step is told while this turn's Ingest is unfinished: a Source
 * read this turn has no INGEST line yet and the INGEST gate still reports
 * work for it. Null when there is nothing to say.
 */
export async function unfinishedIngestNote(
  messages: unknown,
  store: WikiStore
): Promise<string | null> {
  const logged = ingestsLoggedThisTurn(messages);
  const open = sourcesReadThisTurn(messages).filter(
    (id) => !logged.includes(id)
  );
  if (!open.length) return null;
  const declined = await declinedThisTurn(store, messages);
  const proposed = proposedPages(messages);
  for (const id of open) {
    const problems = await ingestProblems(store, id, declined, proposed);
    if (!problems.length) continue;
    const listed = problems.slice(0, LISTED);
    const more = problems.length - listed.length;
    return [
      `The Ingest of ${id} is unfinished. Still open:`,
      ...listed.map((problem) => `- ${problem}`),
      ...(more ? [`(and ${more} more; append_log lists them all)`] : []),
      "Finish it and append its INGEST line before you reply to the Owner.",
    ].join("\n");
  }
  return null;
}
