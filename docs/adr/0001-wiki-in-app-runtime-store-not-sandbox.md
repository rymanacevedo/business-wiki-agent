---
status: accepted
---

# The Wiki lives in an app-runtime store, not the Eve sandbox

Eve's sandbox, built-in file tools, `defineState`, and file memory provider are all per-session or capped at one small document, and Vercel Functions have a read-only filesystem, so none of them can hold a multi-Page Wiki that outlives a session ([research](../research/wiki-persistence.md) on branch `research/wiki-persistence`). We keep the Wiki and the read-only Sources behind one `WikiStore` interface (read, write with optimistic etag, list-by-prefix) with a local-directory backend for `eve dev` and evals and a private Vercel Blob backend when deployed, selected by `process.env.VERCEL`. Wiki tools are authored, not Eve's built-ins, so the Approval boundary sits in the tool list and Source immutability is enforced by the store exposing no write path to Sources.

## Consequences

- Every store path carries a namespace: `demo` in production from an env var, `eval/<runId>/<sessionId>` under evals, never derived from model input or the caller's principal.
- Evals run only against the local backend; the Hobby plan's Blob cap of 2,000 advanced operations a month covers seeding and demo sessions but not eval runs.
- Neon Postgres is the fallback behind the same interface if the Blob cap bites.
- Document upload through chat is out of scope: a `sendFile` attachment lands in the sandbox, and copying it into the store would reopen the immutability boundary.
