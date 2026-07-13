import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AuthGate } from "./AuthGate";
import { parseWorkbenchScope, validateWorkbenchSearch } from "./workbench-model";

const rootRoute = createRootRoute({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
});

// ── workbench 共享 pathless layout（设计 workbench-stable-refactor.md Phase 1）──────────────
// 7 个 workbench 路由（global/project × scope/focus/file/git）塌缩为本 pathless layout 的子路由。
// layout 组件 `WorkbenchLayoutShell` 常驻不卸载——进出项目只 swap 子路由匹配，layout 不 unmount
// → InstanceArea/WorkspaceTree/PanelRouter 实例保活 → WebSocket/relay/xterm 长连不重连。
// layout 从 `useWorkbenchRouteContext()`（useMatches 末位 leaf 派生）读 scope/focusId，单一数据管道、
// source of truth = URL（不引入持久化 atom，无子 render 写/父读时序问题）。
//
// pathless layout route 用 `id`（非 `path`）：自身无 URL 段，子路由被 flatten 进其父做匹配，
// 匹配规则与现状 7 兄弟叶子完全一致（TanStack 字面量段 `session` 优先于 `$key`，已验证）。
// 子路由**不设 component**——layout 已渲染全部中栏内容，子路由只负责 URL 匹配 + validateSearch
//（params 解析 + search 白名单校验在 match 阶段完成，不依赖 component 渲染）。
const workbenchLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "workbench",
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "WorkbenchLayoutShell"),
});

// `/` 入口路由（设计文档 §11）：桌面渲染 global 工作台 / 移动渲染项目列表，由 WorkbenchLayoutShell
// + useIsDesktopViewport 在组件层分流（非 redirect——beforeLoad 不知视口，跨端同 URL）。
const indexRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/",
  validateSearch: validateWorkbenchSearch,
});

// ── workbench 子路由（中栏语义命名，去 /workbench 前缀，设计文档 §7）──────────────
// 同一 URL 桌面三栏 / 移动线性退化响应式渲染（WorkbenchLayoutShell.useIsDesktopViewport），
// 无跨端 redirect。?rightTab=files|git search param 两端共用（桌面读作右栏
// tab、移动读作 header tab）。旧 /projects/$name（ProjectConsole）已与此 project scope
// 路由合并 —— /projects/$key 即 workbench project 作用域，不再单独 redirect。
const projectScopeRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/projects/$key",
  validateSearch: validateWorkbenchSearch,
});

const projectFocusRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/projects/$key/session/$id",
  validateSearch: validateWorkbenchSearch,
});

// file tab focus（设计 §6 决策 2 / workbench-stable-refactor Phase 3）：/projects/$key/file/$
// splat 捕获项目相对路径（如 src/index.ts → _splat="src/index.ts"），layout 解析 _splat 拼项目名
// 前缀成全路径 focusId=`file_${key}/${_splat}`（与 tabIdOf 全路径一致）。project scope 文件 deep-link。
const projectFileFocusRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/projects/$key/file/$",
  validateSearch: validateWorkbenchSearch,
});

// 全局文件 tab focus（设计 workbench-stable-refactor Phase 3）：/files/file/$ splat 捕获全路径
//（含项目名前缀如 "demo/src/index.ts"）。layout 解析 _splat 为 focusId=`file_${fullPath}`，scope=global
// + leftMode="files"（在文件 tab 上下文保留全局文件树）。全局/项目点同一文件 → 同一 tabId 去重。
// 进 workbench layout（非 /files 整页）——文件 tab 跨 scope 共享同一布局，session tab 保活。
const globalFileFocusRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/files/file/$",
  validateSearch: validateWorkbenchSearch,
});

// git diff tab focus（设计 workbench-layout-fix 阶段 3）：/projects/$key/git/$ splat 捕获多段文件相对
// 路径；scope（staged/worktree）走 search param ?gitScope（splat 不便编码 scope）。layout 解析
// _splat + gitScope 为 focusId=`git_${scope}/${path}`（useWorkbenchRouteContext，与 tabIdOf 一致）。
const projectGitFocusRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/projects/$key/git/$",
  validateSearch: validateWorkbenchSearch,
});

// global scope 路由（设计 activity-bar-redesign §6 决策 22）：`/global` 重命名为 `/projects`
//（语义=项目总览，[项目] 导航）。scope kind `global` 类型保留，只改 URL path 段。与
// `/projects/$key`（project scope）不冲突——TanStack Router 字面量段 `session` 优先于参数 `$key`。
const globalScopeRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/projects",
  validateSearch: validateWorkbenchSearch,
});

const globalFocusRoute = createRoute({
  getParentRoute: () => workbenchLayoutRoute,
  path: "/projects/session/$id",
  validateSearch: validateWorkbenchSearch,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("./SettingsRoute"), "SettingsRoute"),
});

// 移动 [文件] 一级入口（设计 §6 决策 24）：移动端渲染 rootBrowse FilesPanel 浮窗；
// 桌面端 component 内部分流回 global 工作台（桌面 [文件] 经活动栏 nav=files）。
// 留在 rootRoute 平级（非 workbench layout 子）——移动 /files 是独立整页，Phase 2-4 收口进 layout。
const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/files",
  component: lazyRouteComponent(() => import("./WorkbenchRoute"), "FilesRoute"),
});

// ── 旧 URL 兼容 redirect（退役期，无并行）────────────────────────────────────────
// 旧换页模型 detail routes 与旧 /workbench/$scope(/$focusId) 一并 redirect 到新中栏语义
// 路径。这些 route 无 component（redirect-only，beforeLoad 即 throw，永不渲染）；
// 旧薄壳 route component（AgentSessionDetailRoute / TerminalSessionDetailRoute /
// Claude2SessionDetailRoute）已删除，SessionDetail / Claude2Chat 作为 workbench 面板宿主
//（embedded）由 instance-panel 直接引用，不再经路由。
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
      throw redirect({ to: "/projects" });
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
      throw redirect({ to: "/projects/session/$id", params: { id: params.focusId } });
    }
    throw redirect({
      to: "/projects/$key/session/$id",
      params: { key: scope.key, id: params.focusId },
    });
  },
});

const routeTree = rootRoute.addChildren([
  workbenchLayoutRoute.addChildren([
    indexRoute,
    projectScopeRoute,
    projectFocusRoute,
    projectFileFocusRoute,
    projectGitFocusRoute,
    globalScopeRoute,
    globalFocusRoute,
    globalFileFocusRoute,
  ]),
  settingsRoute,
  filesRoute,
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
