export type Env = Readonly<Record<string, string | undefined>>;

export interface LangSmithTarget {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

const DEFAULT_ENDPOINT = "https://api.smith.langchain.com";
const EVALS_PROJECT = "business-wiki-agent-evals";

export function target(env: Env): LangSmithTarget | null {
  const key = env.LANGSMITH_API_KEY;
  const project = env.EVAL_RUN_LABEL
    ? env.LANGSMITH_EVAL_PROJECT || EVALS_PROJECT
    : env.LANGSMITH_PROJECT;
  if (!key || !project) return null;
  const base = (env.LANGSMITH_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, "");
  return {
    url: `${base}/otel/v1/traces`,
    headers: { "x-api-key": key, "Langsmith-Project": project },
  };
}
