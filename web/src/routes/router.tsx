import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  getProject,
  listAgentHistory,
  listAgentSessions,
  listTerminalSessions,
} from "../api/client";
import { queryClient } from "../lib/query-client";
import { AuthGate } from "./AuthGate";
import { consoleSectionFromSearch } from "./console-model";
import { HomeRoute } from "./HomeRoute";
import { ProjectConsoleRoute } from "./ProjectConsoleRoute";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
  // Parallel-prefetch the project + its sessions/history so the console mounts
  // with all four queries already cached (no serial waterfall: project -> then
  // agent/terminal/history). allSettled lets the component's own error/loading
  // states handle a missing project instead of throwing in the loader.
  loader: async ({ context, params }) => {
    const { projectName } = params;
    await Promise.allSettled([
      context.queryClient.ensureQueryData({
        queryKey: ["projects", projectName],
        queryFn: () => getProject(projectName),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["projects", projectName, "agent-sessions"],
        queryFn: () => listAgentSessions(projectName),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["projects", projectName, "terminal-sessions"],
        queryFn: () => listTerminalSessions(projectName),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["projects", projectName, "agent-history"],
        queryFn: () => listAgentHistory(projectName),
      }),
    ]);
  },
});

const agentSessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId",
  component: lazyRouteComponent(() => import("./SessionDetailRoute"), "AgentSessionDetailRoute"),
});

const claude2SessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId/claude2",
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
  component: lazyRouteComponent(() => import("./SessionDetailRoute"), "TerminalSessionDetailRoute"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectConsoleRoute,
  agentSessionDetailRoute,
  claude2SessionDetailRoute,
  terminalSessionDetailRoute,
]);

function RoutePending() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
    </div>
  );
}

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPendingMs: 200,
  defaultPreload: "intent",
  defaultPendingComponent: RoutePending,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
