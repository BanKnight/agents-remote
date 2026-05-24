# plan

## Change 目标

- 交付登录后的响应式 Project console shell，让用户能从 Project 列表进入 Project 作用域，并默认聚焦 Agent Sessions 区域。
- 让 `web` 具备第一轮 PWA 安装外壳，支持移动端 standalone 打开，同时不承诺离线、通知或真实 runtime。
- 完成后解锁 v0.3 的 session runtime、移动端会话交互，以及 v0.4 的 Files/Git 入口复用。

## 局部 big picture

- 该 change 是 v0.2 中第一个完整用户可见 shell：上游 Project 模型和安全路径已经完成，下游 Agent/Terminal/Git/Files 会复用它的 Project scoped 信息架构。
- 当前 `web` 仍是 health smoke 页面；本 change 要把它替换为真正的控制台入口，但不跨入 runtime/API 协议设计。
- Project console 中的 session 区域只建立观察空间和空状态，避免提前冻结 `AgentSession` 字段或 provider-specific 语义。

## 执行策略

- 先建立前端页面结构和路由参数，确保 Project list/detail/create 的真实 API 数据能进入 UI。
- 再实现移动端优先的深色 console shell：根入口、Project console、Agent 默认主区、辅助入口和禁用输入 affordance。
- 然后补齐 PWA 静态 manifest、icons 和 HTML meta/link；不新增 `vite-plugin-pwa`，不注册 service worker。
- 最后补齐测试、build、浏览器手动验证和 PWA manifest 证据，确保占位内容不会被误认为真实 runtime。

## 任务顺序依据

- 路由和页面数据流是后续 UI 的阻塞项；未建立 Project route 前无法可靠验证 URL-sensitive Project 名称。
- UI shell 依赖路由和 Project 数据；PWA 静态资源与 UI 基本可独立，但会触碰 `web/index.html` 和主题色，需要在视觉实现后校准。
- 测试和浏览器验证必须后置，因为它们依赖最终路由、UI 状态、manifest 和 build 产物。
- distill 候选不在本阶段执行，但实现中要保留可验证证据供 verify/distill 使用。

## 额外上下文

- `docs/project.md`：Project、Web Control Plane、Agent Runtime 的长期概念和开发准则。
- `docs/specs/project-model/spec.md`：Project identity、列表、创建/采用和 URL-sensitive 名称行为。
- `docs/specs/service-access-boundary/spec.md`：`/api` 同域 API 边界和 `web/api` 分离约束。
- `docs/design/frontend-stack.md`：TanStack Router/Query、Jotai、Tailwind 的职责边界。
- `docs/design/agent-session-model.md`：避免把 terminal/provider-native 细节固化为 AgentSession。
- `docs/architecture/project-boundary.md`：Project safe boundary 和下游 project-scoped 能力边界。
- 代码入口：`web/src/routes/router.tsx`、`web/src/routes/HomeRoute.tsx`、`web/src/api/client.ts`、`web/src/styles/index.css`、`web/index.html`。

## 依赖与阻塞

### 阶段依赖

- 依赖 `setup-monorepo-service-boundaries` 已完成，提供 Vite/React/Tailwind/TanStack/Jotai 和 `/api` dev/prod 路径边界。
- 依赖 `implement-project-model-and-safe-paths` 已完成，提供 `/api/projects` list/detail/create 和 Project identity。
- 不依赖 v0.3 runtime changes；真实 session 数据接入后续完成。

### 任务依赖

- 页面路由与 Project API 数据流先于 console UI 和 tests。
- Console UI 先于浏览器手动验证。
- PWA manifest/icons 可以在路由完成后与 UI 并行，但最终 theme/background 应与 UI 深色视觉一致。
- 测试和 quality commands 依赖前面所有实现任务完成。

### 外部依赖

- 无第三方服务或人工确认。
- 不新增 npm 依赖；无需依赖发布 7 天以外的新包。
- 真机 PWA 安装验证可能受当前环境限制；若无法真机验证，verify 阶段需记录替代证据。

## 并行机会

- PWA 静态资源任务和 Project console UI 可在路由/API 数据流完成后并行，因为一个主要修改 `web/public`/`web/index.html`，另一个主要修改 `web/src`。
- 测试编写可与 UI 实现部分并行，但最终断言需等 UI 文案和路由稳定。
- 由于当前由单 Agent 实施，实际执行可按顺序推进以减少同文件冲突。

## 风险与验证重点

- 验证 Project 名称含空格、中文或 URL-sensitive 字符时路由和 API 请求不破坏 identity。
- 验证 Agent/Terminal/Git/Files 占位不会触发真实 runtime、文件写入或 Git 写操作。
- 验证 manifest 包含 installability 关键字段和 192/512 icons，HTML 正确引用 manifest 和 theme color。
- 运行 `bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`。
- 启动 `api` 与 `web`，在浏览器检查移动端和桌面关键路径；长驻服务使用 tmux 管理。

## 不做事项

- 不新增 service worker、offline cache、push notification 或安装提示逻辑。
- 不新增 Agent/Terminal backend runtime、WebSocket stream 或 session API。
- 不实现 Files/Git 真实读取、文件写操作或 Git 写操作。
- 不引入 UI 组件库、图标库、新状态库或 PWA 插件依赖。
