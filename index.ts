import { createRoutes } from "./routes";
import { pendingRequests, idleSessions } from "./state";
import { settings } from "./settings";
import ui from "./ui.html";

const PORT = Number(process.env.PORT ?? 4759);

Bun.serve({
  port: PORT,
  idleTimeout: 0,
  routes: {
    "/": ui,
    ...createRoutes(pendingRequests, idleSessions, settings),
  },
});

console.log(`Approval server listening on http://localhost:${PORT}`);
