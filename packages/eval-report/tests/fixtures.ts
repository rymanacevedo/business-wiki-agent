import type { EveEvalCompleteContext } from "eve/evals/reporters";
import type { EveEvalResult } from "eve/evals";

type Assertion = EveEvalResult["assertions"][number];

export const gate = (
  name: string,
  passed: boolean,
  message?: string
): Assertion => ({
  name,
  severity: "gate",
  score: passed ? 1 : 0,
  threshold: 1,
  passed,
  errored: false,
  ...(message ? { message } : {}),
});

export const score = (
  key: string,
  value: number,
  threshold?: number
): Assertion => ({
  name: `score [${key}]`,
  key,
  severity: "soft",
  score: value,
  errored: false,
  ...(threshold === undefined ? {} : { threshold, passed: value >= threshold }),
});

/** One completed eval as eve hands it to `onEvalComplete`, trimmed to what reporters read. */
export function completed({
  id,
  caseId,
  tags,
  verdict = "passed",
  assertions = [],
  toolCalls = 0,
  costUsd,
}: {
  id: string;
  caseId: string;
  tags: string[];
  verdict?: EveEvalResult["verdict"];
  assertions?: Assertion[];
  toolCalls?: number;
  costUsd?: number;
}): [EveEvalResult, EveEvalCompleteContext] {
  const usage =
    costUsd === undefined
      ? undefined
      : {
          inputTokens: 1000,
          outputTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd,
        };
  const result = {
    id,
    verdict,
    assertions,
    startedAt: "2026-10-19T10:00:00.000Z",
    completedAt: "2026-10-19T10:01:00.000Z",
    result: {
      output: "",
      finalMessage: "",
      status: "waiting",
      events: [],
      traceContexts: [
        {
          traceId: `trace-${caseId}`,
          spanId: "s",
          traceFlags: 1,
          primary: true,
          sessionId: "sess",
        },
      ],
      derived: { toolCallCount: toolCalls, ...(usage ? { usage } : {}) },
    },
  } as unknown as EveEvalResult;
  const context = {
    evaluation: {
      id,
      description: `Case ${caseId}`,
      tags,
      metadata: { caseId },
    },
    target: {
      kind: "local",
      url: "http://localhost",
      capabilities: { devRoutes: true },
    },
    traceContexts: [],
  } as unknown as EveEvalCompleteContext;
  return [result, context];
}
