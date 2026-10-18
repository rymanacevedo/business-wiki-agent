import { WikiPathError } from "./errors";

// A segment never starts with ".", so "..", hidden files, and the local
// backend's ".tmp" directory are all unreachable.
const SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]*";
const PATH = new RegExp(`^${SEGMENT}(/${SEGMENT})*$`);
const PREFIX = new RegExp(`^(${SEGMENT}/)*(${SEGMENT})?$`);
const NAMESPACE = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/;

/** Sources live under this prefix and have no write path through the store. */
export const SOURCES_PREFIX = "sources/";

export function checkPath(path: string): string {
  if (!PATH.test(path)) throw new WikiPathError("path", path);
  return path;
}

export function checkPrefix(prefix: string): string {
  if (!PREFIX.test(prefix)) throw new WikiPathError("prefix", prefix);
  return prefix;
}

export function checkNamespace(namespace: string): string {
  if (!NAMESPACE.test(namespace))
    throw new WikiPathError("namespace", namespace);
  return namespace;
}

export function isSource(path: string): boolean {
  return `${path}/`.startsWith(SOURCES_PREFIX);
}
