import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AuthGate } from "./AuthGate";
import { consoleSectionFromSearch } from "./console-model";
import { HomeRoute } from "./HomeRoute";
import { ProjectConsoleRoute } from "./ProjectConsoleRoute";
import { validateWorkbenchSearch } from "./workbench-model";

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
    filesPath: typeof search.filesPath === "string" ? search.filesPath : "",
  }),
  component: ProjectConsoleRoute,
});

const agentSessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/workbench/$scope/$focusId",
      params: { scope: params.projectName, focusId: params.sessionId },
    });
  },
  component: lazyRouteComponent(() => import("./SessionDetailRoute"), "AgentSessionDetailRoute"),
});

const claude2SessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId/claude2",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/workbench/$scope/$focusId",
      params: { scope: params.projectName, focusId: params.sessionId },
    });
  },
  component: lazyRouteComponent(
    () => import("./Claude2SessionDetailRoute"),
    "Claude2SessionDetailRoute",
  ),
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
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/workbench/$scope/$focusId",
      params: { scope: params.projectName, focusId: params.sessionId },
    });
  },
  component: lazyRouteComponent(() => import("./SessionDetailRoute"), "TerminalSessionDetailRoute"),
});

const workbenchScopeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workbench/$scope",
  validateSearch: validateWorkbenchSearch,
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "WorkbenchScopeRoute"),
});

const workbenchFocusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workbench/$scope/$focusId",
  validateSearch: validateWorkbenchSearch,
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "WorkbenchFocusRoute"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectConsoleRoute,
  agentSessionDetailRoute,
  claude2SessionDetailRoute,
  terminalSessionDetailRoute,
  workbenchScopeRoute,
  workbenchFocusRoute,
]);

export const router = createRouter({
  routeTree,
  // No defaultPendingComponent on purpose: a router-level pending spinner
  // stacks on top of each page's own loading state (project skeleton → terminal
  // reconnect) and reads as multiple chained animations. Each page owns its own
  // loading UI; the router just keeps the previous view visible until the next
  // route is ready, then swaps directly. defaultPreload fetches lazy chunks on
  // hover/focus so entry is instant without any pending UI.
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
