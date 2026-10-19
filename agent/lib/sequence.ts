// Read the turn so far from a step's model input (`ctx.messages`), so these
// checks survive replay without state of their own. Parts follow the AI SDK
// message shape: assistant `tool-call` parts and `tool-result` parts.

type Part = {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  output?: unknown;
};

/** Content parts of every message since the Owner's last message. */
function partsThisTurn(messages: unknown): Part[] {
  if (!Array.isArray(messages)) return [];
  let start = 0;
  messages.forEach((message, i) => {
    if (message?.role === "user") start = i + 1;
  });
  return messages
    .slice(start)
    .flatMap((message) =>
      Array.isArray(message?.content) ? (message.content as Part[]) : []
    );
}

const callsTo = (parts: Part[], toolName: string) =>
  parts.filter((p) => p?.type === "tool-call" && p.toolName === toolName);

/** The Source ids `read_source` was called with this turn, oldest first. */
export function sourcesReadThisTurn(messages: unknown): string[] {
  return callsTo(partsThisTurn(messages), "read_source")
    .map((p) => (p.input ?? p.args)?.id)
    .filter((id): id is string => typeof id === "string");
}

/** The Pages every `change_fact` call this turn proposed to change. */
export function proposedPages(messages: unknown): string[] {
  return callsTo(partsThisTurn(messages), "change_fact").flatMap((call) => {
    const changes = (call.input ?? call.args)?.changes;
    return Array.isArray(changes)
      ? changes
          .map((c: { page?: unknown }) => c?.page)
          .filter((page): page is string => typeof page === "string")
      : [];
  });
}

/**
 * Page paths named in the new values of `change_fact` calls this turn that
 * did not apply (the Owner denied them, or they failed), e.g. a Supersession's
 * new Obligation.
 */
export function declinedPaths(messages: unknown): string[] {
  const parts = partsThisTurn(messages);
  const results = new Map(
    parts
      .filter((p) => p?.type === "tool-result")
      .map((p) => [p.toolCallId, JSON.stringify(p.output ?? "")])
  );
  const paths: string[] = [];
  for (const call of callsTo(parts, "change_fact")) {
    const result = results.get(call.toolCallId);
    // No result in history counts as not applied: a denial may be recorded
    // as an approval response rather than a tool result.
    if (result?.includes("Approved and applied")) continue;
    const text = JSON.stringify(call.input ?? call.args ?? {});
    for (const match of text.matchAll(/[a-z]+\/[A-Za-z0-9._-]+\.md/g))
      paths.push(match[0]);
  }
  return paths;
}

export type ProposedChange = {
  page: string;
  old_value: string;
  new_value: string;
};

/**
 * The changes of every `change_fact` call this turn the Owner declined. A
 * denial is an `execution-denied` result; no result at all counts too, as in
 * `declinedPaths`. A call that failed on its own (an error result) is no
 * decision of the Owner's, so it is left out.
 */
export function declinedChanges(messages: unknown): ProposedChange[] {
  const parts = partsThisTurn(messages);
  const results = new Map(
    parts
      .filter((p) => p?.type === "tool-result")
      .map((p) => [p.toolCallId, JSON.stringify(p.output ?? "")])
  );
  const changes: ProposedChange[] = [];
  for (const call of callsTo(parts, "change_fact")) {
    const result = results.get(call.toolCallId);
    if (
      result !== undefined &&
      !/execution-denied|TOOL_EXECUTION_DENIED/.test(result)
    )
      continue;
    const proposed = (call.input ?? call.args)?.changes;
    if (!Array.isArray(proposed)) continue;
    for (const c of proposed as Partial<ProposedChange>[])
      if (
        typeof c?.page === "string" &&
        typeof c.old_value === "string" &&
        typeof c.new_value === "string"
      )
        changes.push(c as ProposedChange);
  }
  return changes;
}
