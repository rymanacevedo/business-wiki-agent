import { defineHook } from "eve/hooks";
import { wiki } from "../lib/config";
import { appendLog, logLine } from "../lib/pages";

const DENIED = /The person who denied it wrote: "([\s\S]*)"$/;

/**
 * A denied change_fact never runs, so its APPROVAL denied Log line is written
 * here, from the denial itself, with the Owner's reason. (An approved call
 * logs its own line when it runs.)
 */
export default defineHook({
  events: {
    async "action.result"(event) {
      const { result, error } = event.data as {
        result?: { toolName?: string; output?: { code?: string } };
        error?: { code?: string; message?: string };
      };
      if (result?.toolName !== "change_fact") return;
      if ((error?.code ?? result.output?.code) !== "TOOL_EXECUTION_DENIED")
        return;
      const reason =
        DENIED.exec(error?.message ?? "")?.[1] ?? "no reason given";
      await appendLog(
        wiki(),
        logLine(
          "APPROVAL",
          "denied",
          `change_fact declined by the Owner; the fact is unchanged. Reason: ${reason}`
        )
      );
    },
  },
});
