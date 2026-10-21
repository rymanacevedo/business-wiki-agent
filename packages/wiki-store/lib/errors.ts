/** A path or namespace that could leave its namespace, or is malformed. */
export class WikiPathError extends Error {
  constructor(kind: "path" | "prefix" | "namespace", value: string) {
    super(`Invalid ${kind}: ${JSON.stringify(value)}`);
    this.name = "WikiPathError";
  }
}

/** A write under the read-only `sources/` prefix. */
export class WikiReadOnlyError extends Error {
  constructor(readonly path: string) {
    super(`Sources are read-only: ${path}`);
    this.name = "WikiReadOnlyError";
  }
}

/** The write's etag no longer matches what is stored: re-read and retry. */
export class WikiConflictError extends Error {
  constructor(readonly path: string) {
    super(`Conflict writing ${path}: it changed since it was read`);
    this.name = "WikiConflictError";
  }
}
