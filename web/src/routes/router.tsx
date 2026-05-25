import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AuthGate } from "./AuthGate";
import { consoleSectionFromSearch } from "./console-model";
import { HomeRoute } from "./HomeRoute";
import { ProjectConsoleRoute } from "./ProjectConsoleRoute";
import { AgentSessionDetailRoute, TerminalSessionDetailRoute } from "./SessionDetailRoute";

const rootRoute = createRootRoute({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const projectConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName",
  validateSearch: (search: Record<string, unknown>) => ({
    workspace: consoleSectionFromSearch(search.workspace),
  }),
  component: ProjectConsoleRoute,
});

const agentSessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId",
  component: AgentSessionDetailRoute,
});

const terminalSessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/terminal-sessions/$sessionId",
  validateSearch: (search: Record<string, unknown>) => ({
    fromAgentSession:
      typeof search.fromAgentSession === "string" && search.fromAgentSession.length > 0
        ? search.fromAgentSession
        : undefined,
  }),
  component: TerminalSessionDetailRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectConsoleRoute,
  agentSessionDetailRoute,
  terminalSessionDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
