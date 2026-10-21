export const EVAL_CASE_HEADER = "x-eval-case-id";
const CASE_ATTRIBUTE = "eval.case_id";

/** An eval case id is a short slug; anything else is ignored, not traced. */
const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export interface SessionAuth {
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
  readonly principalId: string;
}

export interface SessionAuthSnapshot {
  readonly auth: {
    readonly current: SessionAuth | null;
    readonly initiator: SessionAuth | null;
  };
}

export function withCase<A extends SessionAuth>(
  auth: A | null,
  headers: Headers
): A | null {
  const caseId = headers.get(EVAL_CASE_HEADER);
  if (auth === null || caseId === null || !CASE_ID.test(caseId)) return auth;
  return {
    ...auth,
    attributes: { ...auth.attributes, [CASE_ATTRIBUTE]: caseId },
  };
}

export function caseContext(
  session: SessionAuthSnapshot
): { readonly "eval.case_id": string } | undefined {
  const auth = session.auth.initiator ?? session.auth.current;
  const caseId = auth?.attributes[CASE_ATTRIBUTE];
  return typeof caseId === "string" ? { [CASE_ATTRIBUTE]: caseId } : undefined;
}
