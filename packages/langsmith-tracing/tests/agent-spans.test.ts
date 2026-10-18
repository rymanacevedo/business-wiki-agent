import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgentSpan } from "../index";

test("keeps the agent run tree", () => {
  const kept = [
    {
      name: "invoke_agent business-wiki-agent",
      attributes: { "gen_ai.operation.name": "invoke_agent" },
    },
    { name: "agent.step", attributes: { "gen_ai.operation.name": "workflow" } },
    {
      name: "chat openai/gpt-5-mini",
      attributes: { "gen_ai.operation.name": "chat" },
    },
    {
      name: "execute_tool read_page",
      attributes: { "gen_ai.operation.name": "execute_tool" },
    },
    { name: "agent.approval", attributes: {} },
  ];
  for (const span of kept) assert.equal(isAgentSpan(span), true, span.name);
});

test("drops Workflow runtime spans, which arrive as their own traces", () => {
  const dropped = [
    {
      name: "workflow.run workflow//eve//workflowEntry",
      attributes: { "workflow.name": "x" },
    },
    { name: "workflow.stream.flush", attributes: {} },
    { name: "step.execute turnStep", attributes: {} },
    { name: "queue.publish", attributes: {} },
  ];
  for (const span of dropped) assert.equal(isAgentSpan(span), false, span.name);
});
