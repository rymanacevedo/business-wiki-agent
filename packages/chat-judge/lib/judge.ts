import type { Experimental_DecisionModel } from "ai";
import { z } from "zod";

/** The decision-model contract eve's `t.judge` accepts as an instance. */
export type DecisionModelV4 = Extract<
  Experimental_DecisionModel,
  { doDecide: unknown }
>;
type CallOptions = Parameters<DecisionModelV4["doDecide"]>[0];
type Question = CallOptions["questions"][string];
type Result = Awaited<ReturnType<DecisionModelV4["doDecide"]>>;

/** One structured-output request to a chat model: the network edge. */
export type JudgeGenerate = (request: {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType;
  abortSignal?: AbortSignal;
}) => Promise<{
  output: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}>;

const SUPPORTED = ["boolean", "score", "choice"] as const;

const SYSTEM = [
  "You are an evaluation judge. Read the state, then answer every question about it.",
  "For a boolean question give the probability, from 0 to 1, that the answer is true.",
  "For a score question give the zero-based index of the level that fits best; levels run from worst to best.",
  "For a choice question give the key of the option that fits best.",
  "Judge only from the state; do not assume facts that are not in it.",
].join("\n");

function answerSchema(question: Question): z.ZodType {
  switch (question.type) {
    case "boolean":
      return z.object({ probability: z.number().min(0).max(1) });
    case "score":
      return z.object({
        level: z
          .number()
          .int()
          .min(0)
          .max(question.criteria.length - 1),
      });
    case "choice": {
      const keys = Object.keys(question.criteria);
      return z.object({ choice: z.enum(keys as [string, ...string[]]) });
    }
    default:
      throw new Error(
        `chat judge cannot answer a ${question.type} question; it answers ${SUPPORTED.join(", ")}`
      );
  }
}

function stateValue(state: CallOptions["state"]): unknown[] {
  return state.map((part) => {
    if (part.type === "json") return part.value;
    if (part.type === "text") return part.text;
    return `[${part.type} part omitted]`;
  });
}

/**
 * A decision model over a chat model: `doDecide` asks for structured output
 * with one field per question. The boolean probability is the chat model's
 * self-report, not a token-level estimate.
 */
export function chatJudge(
  modelId: string,
  { generate }: { generate: JudgeGenerate }
): DecisionModelV4 {
  return {
    specificationVersion: "v4",
    provider: "gateway-chat-judge",
    modelId,
    supportedQuestionTypes: SUPPORTED,
    async doDecide({ state, questions, abortSignal }): Promise<Result> {
      const shape: Record<string, z.ZodType> = {};
      for (const [key, question] of Object.entries(questions))
        shape[key] = answerSchema(question);
      const schema = z.object(shape);
      const { output, usage } = await generate({
        model: modelId,
        system: SYSTEM,
        prompt: JSON.stringify(
          { state: stateValue(state), questions },
          null,
          2
        ),
        schema,
        abortSignal,
      });
      const parsed = schema.parse(output) as Record<
        string,
        { probability?: number; level?: number; choice?: string }
      >;
      const answers: Result["answers"] = {};
      for (const [key, question] of Object.entries(questions)) {
        const answer = parsed[key]!;
        answers[key] =
          question.type === "boolean"
            ? { type: "boolean", probability: answer.probability! }
            : question.type === "score"
              ? { type: "score", score: answer.level! }
              : { type: "choice", choice: answer.choice! };
      }
      return {
        answers,
        warnings: [],
        usage: {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        },
        response: { modelId },
      };
    },
  };
}
