import { defaultEveAuth, eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";
import { withEvalCase } from "../../packages/langsmith-tracing";

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // The demo URL is open to anyone, on purpose: a Reviewer needs no
    // credentials. The per-session caps in agent.ts are the only mitigation.
    // The fix is one line: httpBasic() with a shared reviewer credential
    // (plus a matching Next.js proxy check). See the README's limitations.
    none(),
  ],
  // Evals send `x-eval-case-id`; it rides on the session auth so traces can
  // carry the case id (see agent/instrumentation/langsmith.ts).
  onMessage: (ctx) => ({
    auth: withEvalCase(defaultEveAuth(ctx), ctx.eve.request.headers),
  }),
});
