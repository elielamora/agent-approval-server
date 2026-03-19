import { createRoutes } from "./routes";
import { pendingRequests, idleSessions, payloadLog, IDLE_SESSION_TTL_MS } from "./state";
import { settings } from "./settings";
import { logRemoval } from "./utils";

const PORT = Number(process.env.PORT ?? 4759);

Bun.serve({
  port: PORT,
  idleTimeout: 0,
  routes: {
    ...createRoutes(pendingRequests, idleSessions, settings, payloadLog),
    "/*": async (req) => {
      const url = new URL(req.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(`./frontend/dist${path}`);
      if (await file.exists()) return new Response(file);
      return new Response(Bun.file("./frontend/dist/index.html"));
    },
  },
});

console.log(`Approval server listening on http://localhost:${PORT}`);

setInterval(() => {
  const cutoff = Date.now() - IDLE_SESSION_TTL_MS;
  for (const [id, session] of idleSessions) {
    if (session.idleSince < cutoff) {
      console.log(`[idle-expire] session=${id}`);
      idleSessions.delete(id);
    }
  }
}, 60_000);

function shutdown(signal: string) {
  console.log(`[shutdown] ${signal}: resolving ${pendingRequests.size} pending entries`);
  for (const [id, entry] of pendingRequests) {
    logRemoval(id, "shutdown", entry);
    pendingRequests.delete(id);
    entry.resolve("deny");
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
