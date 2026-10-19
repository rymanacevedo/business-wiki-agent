import assert from "node:assert/strict";
import { test } from "node:test";
import { chatJudge, type JudgeGenerate } from "../index";

/** A chat model faked at the network edge: records the call, returns `output`. */
function fakeChat(output: unknown) {
  const calls: Parameters<JudgeGenerate>[0][] = [];
  const generate: JudgeGenerate = async (request) => {
    calls.push(request);
    return { output, usage: { inputTokens: 120, outputTokens: 9 } };
  };
  return { calls, generate };
}

test("a boolean question is answered with the chat model's probability", async () => {
  const chat = fakeChat({ faithful: { probability: 0.85 } });
  const judge = chatJudge("mistral/mistral-medium-3.5", {
    generate: chat.generate,
  });

  const result = await judge.doDecide({
    state: [
      {
        type: "json",
        value: { summary: "Rent $1,450", source: "Rent $1,450" },
      },
    ],
    questions: {
      faithful: { type: "boolean", instructions: "Nothing unsupported?" },
    },
  });

  assert.deepEqual(result.answers, {
    faithful: { type: "boolean", probability: 0.85 },
  });
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 9 });
  assert.equal(result.response?.modelId, "mistral/mistral-medium-3.5");
  assert.equal(chat.calls[0]?.model, "mistral/mistral-medium-3.5");
  assert.match(chat.calls[0]!.prompt, /Rent \$1,450/);
  assert.match(chat.calls[0]!.prompt, /Nothing unsupported\?/);
});

test("score and choice questions map to a level index and an option key", async () => {
  const chat = fakeChat({
    tone: { level: 2 },
    outcome: { choice: "declined-with-referral" },
  });
  const judge = chatJudge("openai/gpt-oss-120b", { generate: chat.generate });

  const result = await judge.doDecide({
    state: [{ type: "text", text: "Ask a CPA." }],
    questions: {
      tone: {
        type: "score",
        instructions: "Tone?",
        criteria: ["advice", "hedged", "facts only"],
      },
      outcome: {
        type: "choice",
        instructions: "Classify.",
        criteria: {
          answered: null,
          "declined-with-referral": "Declines and names a professional",
        },
      },
    },
  });

  assert.deepEqual(result.answers, {
    tone: { type: "score", score: 2 },
    outcome: { type: "choice", choice: "declined-with-referral" },
  });
  assert.match(chat.calls[0]!.prompt, /Ask a CPA\./);
});

test("the structured-output schema rejects answers outside each question's range", async () => {
  const chat = fakeChat({
    tone: { level: 1 },
    ok: { probability: 1 },
    pick: { choice: "a" },
  });
  const judge = chatJudge("m", { generate: chat.generate });
  await judge.doDecide({
    state: [],
    questions: {
      tone: { type: "score", instructions: "x", criteria: ["low", "high"] },
      ok: { type: "boolean", instructions: "y" },
      pick: {
        type: "choice",
        instructions: "z",
        criteria: { a: null, b: null },
      },
    },
  });
  const schema = chat.calls[0]!.schema;
  const valid = {
    tone: { level: 1 },
    ok: { probability: 0.2 },
    pick: { choice: "b" },
  };

  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(
    schema.safeParse({ ...valid, tone: { level: 2 } }).success,
    false
  );
  assert.equal(
    schema.safeParse({ ...valid, ok: { probability: 1.5 } }).success,
    false
  );
  assert.equal(
    schema.safeParse({ ...valid, pick: { choice: "c" } }).success,
    false
  );
});

test("it declares the question types it answers and refuses others before any call", async () => {
  const chat = fakeChat({});
  const judge = chatJudge("m", { generate: chat.generate });

  assert.deepEqual([...judge.supportedQuestionTypes].sort(), [
    "boolean",
    "choice",
    "score",
  ]);
  await assert.rejects(
    async () =>
      judge.doDecide({
        state: [],
        questions: { where: { type: "box", instructions: "Find it" } },
      }),
    /box/
  );
  assert.equal(chat.calls.length, 0);
});
