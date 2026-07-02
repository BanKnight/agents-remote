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
import { parseWorkbenchScope, validateWorkbenchSearch } from "./workbench-model";

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

// ── workbench 主动路由（中栏语义命名，去 /workbench 前缀，设计文档 §7）──────────────
// 同一 URL 桌面三栏 / 移动线性退化响应式渲染（WorkbenchRoute.useIsDesktopViewport），
// 无跨端 redirect。?rightTab=files|git|prototype search param 两端共用（桌面读作右栏
// tab、移动读作 header tab）。旧 /projects/$name（ProjectConsole）已与此 project scope
// 路由合并 —— /projects/$key 即 workbench project 作用域，不再单独 redirect。
const projectScopeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$key",
  validateSearch: validateWorkbenchSearch,
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "ProjectScopeRoute"),
});

const projectFocusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$key/session/$id",
  validateSearch: validateWorkbenchSearch,
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "ProjectFocusRoute"),
});

const globalScopeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/global",
  validateSearch: validateWorkbenchSearch,
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "GlobalScopeRoute"),
});

const globalFocusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/global/session/$id",
  validateSearch: validateWorkbenchSearch,
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "GlobalFocusRoute"),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("./SettingsRoute"), "SettingsRoute"),
});

// ── 旧 URL 兼容 redirect（退役期，无并行）────────────────────────────────────────
// 旧换页模型 detail routes 与旧 /workbench/$scope(/$focusId) 一并 redirect 到新中栏语义
// 路径。这些 route 无 component（redirect-only，beforeLoad 即 throw，永不渲染）；
// 旧薄壳 SessionDetailRoute 顶层函数 + Claude2SessionDetailRoute 顶层函数仍引用旧 route id
//（typecheck 需要 redirect-only route 留在 tree），Phase 4 一并清理。
const agentSessionDetailRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$key/session/$id",
      params: { key: params.projectName, id: params.sessionId },
    });
  },
});

const claude2SessionDetailRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectName/agent-sessions/$sessionId/claude2",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$key/session/$id",
      params: { key: params.projectName, id: params.sessionId },
    });
  },
});

const terminalSessionDetailRedirect = createRoute({
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
      to: "/projects/$key/session/$id",
      params: { key: params.projectName, id: params.sessionId },
    });
  },
});

const workbenchScopeRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workbench/$scope",
  beforeLoad: ({ params }) => {
    const scope = parseWorkbenchScope(params.scope);
    if (scope.kind === "global") {
      throw redirect({ to: "/global" });
    }
    throw redirect({ to: "/projects/$key", params: { key: scope.key } });
  },
});

const workbenchFocusRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workbench/$scope/$focusId",
  beforeLoad: ({ params }) => {
    const scope = parseWorkbenchScope(params.scope);
    if (scope.kind === "global") {
      throw redirect({ to: "/global/session/$id", params: { id: params.focusId } });
    }
    throw redirect({
      to: "/projects/$key/session/$id",
      params: { key: scope.key, id: params.focusId },
    });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectScopeRoute,
  projectFocusRoute,
  globalScopeRoute,
  globalFocusRoute,
  settingsRoute,
  agentSessionDetailRedirect,
  claude2SessionDetailRedirect,
  terminalSessionDetailRedirect,
  workbenchScopeRedirect,
  workbenchFocusRedirect,
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
