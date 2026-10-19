import type { EveEvalContext, EveEvalTurn } from "eve/evals";
import { EVAL_CASE_HEADER } from "../../packages/langsmith-tracing";

/** The free Gateway tier allows about 5 agent requests a minute, team-wide. */
const RATE_LIMIT_WAIT_MS = 75_000;
const RATE_LIMITED = /rate.?limit|429|too many requests|MODEL_CALL_FAILED/i;

/** A turn that failed on a model call (on the free tier, almost always the rate limit). */
const failedOnRateLimit = (turn: EveEvalTurn) =>
  turn.status === "failed" &&
  turn.events.some(
    (e) =>
      (e.type === "turn.failed" || e.type === "step.failed") &&
      RATE_LIMITED.test(JSON.stringify(e))
  );

/**
 * Send the case's first message and keep the turn going through the free
 * tier's limits, all within the eval's timeout: after a rate-limited failure
 * wait 75 s and ask Clerk to continue; answer a session-limit prompt with
 * Continue. Every request carries the case id header so traces can be found.
 * Returns the last turn. Approval requests are left pending for the case.
 */
export async function drive(
  t: EveEvalContext<unknown>,
  caseId: string,
  message: string
): Promise<EveEvalTurn> {
  const headers = { [EVAL_CASE_HEADER]: caseId };
  let turn = await t.send(message, { headers });
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
      continue;
    }
    if (!failedOnRateLimit(turn)) break;
    t.log(`${caseId}: turn failed (rate limit?); retrying in 75 s`);
    await t.sleep(RATE_LIMIT_WAIT_MS);
    turn = await turn.session.send(
      "Continue where you stopped. Finish the same request.",
      { headers }
    );
  }
  return turn;
}
