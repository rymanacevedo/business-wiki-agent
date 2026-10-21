import type { Manifest } from "../../corpus";
import { check, type Check } from "./wiki";

/** `list_sources` output: its Inbox is exactly the Manifest's held-back set. */
export function inboxCheck(manifest: Manifest, output: unknown): Check {
  const inbox = (output as { inbox?: unknown } | undefined)?.inbox;
  const got = Array.isArray(inbox) ? inbox.map(String).sort() : [];
  const want = manifest.sources
    .filter((s) => s.inbox)
    .map((s) => s.id)
    .sort();
  return check(
    `Inbox is the held-back ${want.length === 3 ? "three" : want.length}`,
    Array.isArray(inbox) && got.join() === want.join(),
    `expected [${want.join(", ")}], found [${got.join(", ")}]`
  );
}
