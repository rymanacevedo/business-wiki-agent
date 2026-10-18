import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5.5",
  // Every tool is authored under agent/tools; no bash, file, or web tools.
  defaultTools: false,
  // The only abuse mitigation for the open demo URL: bound each session.
  limits: {
    maxTokenCostUsdPerSession: 1,
    maxInputTokensPerSession: 300_000,
  },
});
