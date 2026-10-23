import type { EveEvalContext, EveEvalSession, EveEvalTurn } from "eve/evals";
import { EVAL_CASE_HEADER } from "../../packages/langsmith-tracing";

/** The free Gateway tier allows about 5 agent requests a minute, team-wide. */
const RATE_LIMIT_WAIT_MS = 75_000;
const RATE_LIMITED = /rate.?limit|429|too many requests|MODEL_CALL_FAILED/i;

type Context = EveEvalContext<unknown>;
export type InputRequest = EveEvalTurn["inputRequests"][number];

/** A turn that failed on a model call (on the free tier, almost always the rate limit). */
const failedOnRateLimit = (turn: EveEvalTurn) =>
  turn.status === "failed" &&
  turn.events.some(
    (e) =>
      (e.type === "turn.failed" || e.type === "step.failed") &&
      RATE_LIMITED.test(JSON.stringify(e))
  );

const headersFor = (caseId: string) => ({ [EVAL_CASE_HEADER]: caseId });

/**
 * Send the case's first message and keep the turn going through the free
 * tier's limits, all within the eval's timeout: after a rate-limited failure
 * wait 75 s and ask Clerk to continue; answer a session-limit prompt with
 * Continue. Every request carries the case id header so traces can be found.
 * Returns the last turn. Approval requests are left pending for the case.
 * Pass `session` to send a follow-up turn on an existing conversation.
 */
export async function drive(
  t: Context,
  caseId: string,
  message: string,
  session?: EveEvalSession
): Promise<EveEvalTurn> {
  return (await driveSegments(t, caseId, message, session)).turn;
}

/**
 * `drive`, also returning every segment the turn took, first to last: each
 * continuation (a session-limit answer, a retry after a rate limit) is a new
 * eve turn whose `toolCalls` hold only that segment's calls.
 */
export async function driveSegments(
  t: Context,
  caseId: string,
  message: string,
  session?: EveEvalSession
): Promise<{ turn: EveEvalTurn; segments: EveEvalTurn[] }> {
  const headers = headersFor(caseId);
  const segments: EveEvalTurn[] = [];
  const turn = await settle(
    t,
    caseId,
    session
      ? await session.send(message, { headers })
      : await t.send(message, { headers }),
    segments
  );
  return { turn, segments };
}

/** Send a follow-up on the turn's session and keep it going the same way. */
export const followUp = (
  t: Context,
  caseId: string,
  turn: EveEvalTurn,
  message: string
): Promise<EveEvalTurn> => drive(t, caseId, message, turn.session);

/** The turn's pending `change_fact` Approval request, if it parked on one. */
export const pendingChangeFact = (
  turn: EveEvalTurn
): InputRequest | undefined =>
  turn.inputRequests.find(
    (r) => r.kind === "tool-approval" && r.action.toolName === "change_fact"
  );

/**
 * Answer an Approval request as the Owner: `approve`, or deny with a reason
 * (eve's `cancel` option with text, which Clerk reads quoted). Then keep the
 * resumed turn going like `drive`.
 */
export async function answer(
  t: Context,
  caseId: string,
  turn: EveEvalTurn,
  request: InputRequest,
  decision: { approve: true } | { deny: string }
): Promise<EveEvalTurn> {
  const response =
    "approve" in decision
      ? { requestId: request.requestId, optionId: "approve" }
      : {
          requestId: request.requestId,
          optionId: "cancel",
          text: decision.deny,
        };
  t.log(
    `${caseId}: ${"approve" in decision ? "approving" : "denying"} change_fact`
  );
  return settle(
    t,
    caseId,
    await turn.session.respond([response], { headers: headersFor(caseId) })
  );
}

/** Ride out rate-limit failures and session-limit prompts until the turn settles. */
async function settle(
  t: Context,
  caseId: string,
  first: EveEvalTurn,
  segments: EveEvalTurn[] = []
): Promise<EveEvalTurn> {
  const headers = headersFor(caseId);
  let turn = first;
  segments.push(turn);
  for (let round = 0; round < 6 && !t.signal.aborted; round++) {
    const limit = turn.inputRequests.find((r) => r.kind === "session-limit");
    if (limit) {
      const option =
        limit.options?.find((o) => /continue/i.test(`${o.id} ${o.label}`)) ??
        limit.options?.[0];
      if (!option) break;
      t.log(`${caseId}: session limit reached; answering ${option.id}`);
      turn = await turn.session.respond(
        [{ requestId: limit.requestId, optionId: option.id }],
        { headers }
      );
      segments.push(turn);
      continue;
    }
    if (!failedOnRateLimit(turn)) break;
    t.log(`${caseId}: turn failed (rate limit?); retrying in 75 s`);
    await t.sleep(RATE_LIMIT_WAIT_MS);
    turn = await turn.session.send(
      "Continue where you stopped. Finish the same request.",
      { headers }
    );
    segments.push(turn);
  }
  return turn;
}
