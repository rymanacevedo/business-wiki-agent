/**
 * The Source ids `read_source` was called with since the Owner's last message,
 * oldest first, read from the step's model input (`ctx.messages`), so the
 * check survives replay without state of its own.
 */
export function sourcesReadThisTurn(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  let start = 0;
  messages.forEach((message, i) => {
    if (message?.role === "user") start = i + 1;
  });
  const ids: string[] = [];
  for (const message of messages.slice(start)) {
    if (message?.role !== "assistant" || !Array.isArray(message.content))
      continue;
    for (const part of message.content) {
      const id = part?.input?.id ?? part?.args?.id;
      if (
        part?.type === "tool-call" &&
        part.toolName === "read_source" &&
        typeof id === "string"
      )
        ids.push(id);
    }
  }
  return ids;
}
