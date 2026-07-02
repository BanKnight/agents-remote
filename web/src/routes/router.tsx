import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AuthGate } from "./AuthGate";
import { HomeRoute } from "./HomeRoute";
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

// 旧换页模型 ProjectConsole（/projects/$name）已由 workbench 三栏 + 左栏树 + InstanceArea
// 取代（设计文档 §1-7）。路由保留为 redirect-only：旧 URL/书签兼容 → workbench 同项目作用域。
// ProjectConsoleRoute.tsx 文件已无路由入口，后续清理（见 workbench-redesign 淘汰清单）。
const projectConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/workbench/$scope",
      params: { scope: params.projectName },
    });
  },
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
