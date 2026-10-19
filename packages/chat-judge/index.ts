import { generateText, Output } from "ai";
import { chatJudge, type DecisionModelV4 } from "./lib/judge";

export {
  chatJudge,
  type DecisionModelV4,
  type JudgeGenerate,
} from "./lib/judge";

/**
 * A judge for eve's `t.judge` over a Vercel AI Gateway chat model (free tier
 * has no decision models, and `decide` rejects language-model ids). Answers
 * boolean, score, and choice questions through structured output.
 */
export function gatewayChatJudge(modelId: string): DecisionModelV4 {
  return chatJudge(modelId, {
    async generate({ model, system, prompt, schema, abortSignal }) {
      const result = await generateText({
        model,
        system,
        prompt,
        abortSignal,
        output: Output.object({ schema }),
      });
      return { output: result.output, usage: result.usage };
    },
  });
}
