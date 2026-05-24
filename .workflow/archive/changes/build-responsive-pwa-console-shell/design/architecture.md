# Architecture Design

## Change

- change-id：build-responsive-pwa-console-shell

## 架构上下文

- `web` 是浏览器/PWA 控制面，使用 React + Vite + TanStack + Jotai。
- `api` 提供 `/api/projects` 和受保护 Project safe path 能力。
- `packages/shared` 只保存跨边界 DTO/type，不承载前端布局、runtime 或路径解析逻辑。
- 本 change 位于真实 Agent Runtime 之前，只建立 Project scoped console shell 和 PWA 外壳。

## 系统边界

```mermaid
flowchart TD
  Browser[Browser or installed PWA] --> Web[web React console shell]
  Web --> Router[TanStack Router]
  Web --> Query[TanStack Query]
  Query --> ApiClient[/api client]
  ApiClient --> ProjectApi[/api/projects]
  ProjectApi --> ProjectService[api Project service]
  ProjectService --> SafePaths[PROJECTS_ROOT safe boundary]
  Web --> StaticAssets[manifest and icons under web/public]
  Web -. future .-> SessionRuntime[Agent/Terminal runtime]
```

- `web` owns PWA manifest/icons and page shell.
- `api` remains the only runtime boundary for Project lookup and future session APIs.
- Project identity remains `PROJECTS_ROOT` first-level directory name; frontend only treats it as route/API parameter.
- Future Agent/Terminal runtime is explicitly outside this change.

## 模块关系

- Project list/detail data flows from `api` through `/api/projects` to `web` Query layer.
- Project console shell consumes Project summary and local UI state to render navigation and placeholders.
- PWA manifest/icons are build/static assets served by Vite/deployment layer, not API resources.
- Terminal/Git/Files/Agent section entries are product navigation affordances now; their real data modules are future changes.

## 技术选型 / 方案取舍

- PWA implementation：static manifest/meta/icons instead of `vite-plugin-pwa`.
  - 选择原因：本轮只要求 installability 和 standalone 外壳，不要求 offline、service worker、precache 或 update prompt。
  - 不选插件原因：`vite-plugin-pwa` 会引入 Workbox 和 service worker lifecycle，增加供应链和调试复杂度。
  - 重新评估条件：需要离线缓存、安装提示控制、更新提示、预缓存策略或更完整 PWA lifecycle。
- Routing：继续使用 TanStack Router。
  - 选择原因：已是项目长期前端边界，适合承载 Project route param。
- Server state：继续使用 TanStack Query。
  - 选择原因：Project list/detail/create 是典型 server state，不应放入 Jotai。
- Local UI state：继续使用 Jotai 或局部 state。
  - 选择原因：底部 affordance、当前 section 等是非持久化 UI state。

## 演进策略

- 当前 shell 先落地 Project-scoped 信息架构和 PWA 静态外壳。
- `design-session-runtime-boundaries` 完成后，再把真实 Agent/Terminal summary 接入 Agent panel。
- Files/Git 后续 change 复用当前 Project console navigation，不需要重建入口层。
- 如果未来引入 service worker，必须先定义实时数据、WebSocket、API 缓存和认证 token 的缓存边界。

## 关键决策

- PWA 属于 `web` 静态资源和 HTML shell，不触碰 `api` 或 `packages/shared`。
- Project console 不引入 provider-specific Agent 字段；真实 AgentSession 语义等待 runtime 设计。
- 不为了占位 UI 创建假的 shared session DTO，避免污染长期协议。

## 风险与权衡

- 不使用 service worker 可能导致部分浏览器 PWA 评分较低，但符合“离线不是重点”的产品边界。
- 过早把 session UI 字段做成共享类型会冻结尚未设计的 runtime 语义，因此本 change 限定在 view-local placeholder。
- PWA 图标和 manifest 是用户可见外壳，需验证移动端安装体验，不只跑 build。

## 开放问题

- 后续 runtime 接入是否复用当前路由结构还是新增 session detail 路由，由 v0.3 runtime changes 决定。

## 后续沉淀候选

- PWA 静态 shell 的架构边界可沉淀到 `docs/design/frontend-stack.md`。
- Project console shell 与 runtime 边界可沉淀到新的长期 design 文档。