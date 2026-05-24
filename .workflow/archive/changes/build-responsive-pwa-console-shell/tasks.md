# tasks

## 执行顺序

1. 先改造前端路由和 Project API 数据流，这是 Project console shell 的基础。
2. 再实现移动端优先的 Project console UI 和各 section 占位。
3. 并行或随后补齐 PWA 静态 manifest/icons/meta。
4. 最后补齐测试、质量命令、浏览器/PWA 验证和任务状态收口。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 建立 Project list 与 Project console 路由结构
  - 结果：新增 `/projects/$projectName` TanStack Router 路由，根入口展示 Project 列表/创建入口；`projectConsolePath` 和 API client 测试覆盖 URL-sensitive 名称编码。
  - 验收标准：`/` 展示 Project 列表/创建入口；Project 名称路由能进入 Project console；URL-sensitive Project 名称通过路由和 `getProject` 正常表达。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/frontend.md`；`docs/specs/project-model/spec.md`
  - 必读上下文：`web/src/routes/router.tsx`、`web/src/routes/HomeRoute.tsx`、`web/src/api/client.ts`、`docs/design/frontend-stack.md`
  - 修改范围：`web/src/routes/`，必要时新增 route/page 组件。
  - 依赖：无
  - 并行：否（阻塞 Project console UI 和 route-level tests）

- [x] 1.2 接入 Project list/detail/create 的前端数据流
  - 结果：根入口用 TanStack Query 读取/创建 Project，创建成功后进入 Project console；Project console 用 detail API 获取当前 Project，上层 AuthGate 处理未登录入口。
  - 验收标准：根入口用 TanStack Query 加载 Project 列表；创建 Project 后可刷新列表或进入 Project；Project console 用 Project detail 显示当前 Project 上下文；错误和加载状态可见。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/frontend.md`；`docs/specs/project-model/spec.md`
  - 必读上下文：`web/src/api/client.ts`、`web/src/api/client.test.ts`、`packages/shared/src/index.ts`
  - 修改范围：`web/src/routes/`、必要的前端测试。
  - 依赖：1.1
  - 并行：否（与 1.1 修改同一路由数据边界）

### 2. 核心实现任务

- [x] 2.1 实现移动端优先深色 Project console shell
  - 结果：Project console 默认展示 Agent Sessions 主区，侧边/卡片导航提供 Terminal/Git/Files 入口；移动端单列、桌面侧栏与双栏布局共用同一产品逻辑。
  - 验收标准：进入 Project 后默认显示 Agent Sessions 主区；顶部展示 Project 上下文；Terminal/Git/Files 作为辅助入口可发现；桌面宽屏利用更宽空间但保持同一产品逻辑。
  - 依据：`specs/pwa-console-shell/spec.md`；`specs/project-console-navigation/spec.md`；`design/product.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/design/prototype.png`、`web/src/styles/index.css`、`docs/design/agent-session-model.md`
  - 修改范围：`web/src/routes/`、可能新增 `web/src/components/` 或 route-local components、`web/src/styles/index.css`。
  - 依赖：1.1、1.2
  - 并行：是（可与 2.3 并行；不改同一 PWA 静态资源）

- [x] 2.2 实现占位、空状态和禁用输入 affordance
  - 结果：Agent 区域显示 no runtime 空状态，Terminal/Git/Files 明确为 coming soon；底部 input affordance 显示 disabled，不发送任何 runtime 输入。
  - 验收标准：无真实 session 数据时 Agent 区域显示清晰空状态；Terminal/Git/Files 未实现能力显示 coming soon/占位；底部输入或快速操作 affordance 不发送真实 runtime 输入。
  - 依据：`specs/project-console-navigation/spec.md`；`design/ui-ux.md`；`design/product.md`；`design/risks.md`
  - 必读上下文：`docs/design/agent-session-model.md`、`docs/specs/agent-access/spec.md`
  - 修改范围：Project console route/components。
  - 依赖：2.1
  - 并行：否（依赖 shell 结构和文案层级）

- [x] 2.3 补齐 PWA 静态安装外壳
  - 结果：新增 `web/public/manifest.webmanifest`、192/512 PNG icons，并在 `web/index.html` 补齐 manifest、theme color、mobile/apple meta 与 icon links。
  - 验收标准：存在 manifest、192x192 与 512x512 icon；`web/index.html` 引用 manifest、theme color、apple/mobile 相关 meta；manifest 包含 `name`、`short_name`、`start_url`、`display: "standalone"`、`theme_color`、`background_color`、icons。
  - 依据：`specs/pwa-console-shell/spec.md`；`design/frontend.md`；`design/architecture.md`
  - 必读上下文：`web/index.html`、`web/src/styles/index.css`
  - 修改范围：`web/index.html`、`web/public/`。
  - 依赖：1.1
  - 并行：是（可与 2.1 并行；最终 theme color 与 UI 对齐即可）

### 3. 集成与验证任务

- [x] 3.1 补齐前端行为测试
  - 结果：新增 `console-model.test.ts` 和 `pwa-manifest.test.ts`，并扩展 `client.test.ts` 覆盖 auth status/login、Project URL 编码、默认 Agent 焦点、deferred sections、runtime input disabled 和 PWA manifest 字段。
  - 验收标准：测试覆盖 Project 列表加载、Project 创建/进入、Project console 默认 Agent 焦点、占位 section 不执行真实操作；已有 API client tests 仍通过。
  - 依据：`plan.md`；`design/frontend.md`；`design/risks.md`
  - 必读上下文：`web/src/api/client.test.ts`、`web/package.json`
  - 修改范围：`web/src/**/*.test.ts` 或 `web/src/**/*.test.tsx`。
  - 依赖：1.2、2.1、2.2
  - 并行：否（依赖 UI 和文案稳定）

- [x] 3.2 运行质量命令并修复失败
  - 结果：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过；web tests 14 个、api tests 41 个、shared tests 2 个均通过。
  - 验收标准：`bun run format:check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build` 全部通过。
  - 依据：`plan.md`；`docs/architecture/monorepo-service-boundaries.md`
  - 必读上下文：根 `package.json`、各 workspace scripts。
  - 修改范围：按失败结果局部修复。
  - 依赖：3.1、2.3
  - 并行：否（最终集成验证）

- [x] 3.3 浏览器验证移动端/桌面和 PWA manifest
  - 结果：使用 tmux 启动 `agents-remote-api-shell` 与 `agents-remote-web-shell`；用 `agent-browser` 验证登录、Project 列表、URL-sensitive Project 进入、Agent 默认焦点、Terminal coming soon 占位、移动/桌面视口；截图保存为 `artifacts/console-desktop.png` 与 `artifacts/console-mobile.png`；浏览器内确认 manifest link `/manifest.webmanifest` 和 theme color `#020617`。
  - 验收标准：使用 tmux 启动 `api` 和 `web`；浏览器验证根入口、Project 创建/进入、Project console 默认 Agent 焦点、移动端窄屏、桌面宽屏；DevTools/Application 或等效方式确认 manifest 和 icons 可见。
  - 依据：`plan.md`；`design/risks.md`；`docs/project.md`
  - 必读上下文：`docs/project.md` 中 tmux 开发准则。
  - 修改范围：无固定范围；若发现问题，回到对应实现任务修复。
  - 依赖：3.2
  - 并行：否（需要可运行集成产物）

### 4. 清理与横切任务

- [x] 4.1 收口任务状态和实现证据
  - 结果：所有实现任务已完成并勾选；质量命令、Project API、web dev proxy、PWA manifest/icons 和 agent-browser 浏览器验证证据已记录；无未解决阻塞。
  - 验收标准：本文件所有实现任务已勾选；记录质量命令和浏览器/PWA 验证结果；不存在未解决阻塞。
  - 依据：`plan.md`；`progress.md`；`design/risks.md`
  - 必读上下文：本 change 的 `progress.md` 和 `verify` 前置要求。
  - 修改范围：`.workflow/changes/build-responsive-pwa-console-shell/tasks.md`，必要时补充 artifacts/证据路径。
  - 依赖：3.2、3.3
  - 并行：否（收口任务）

## 依赖图

- 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 3.3 → 4.1
- 1.1 → 2.3 → 3.2

## 可并行任务

- 2.1 与 2.3：在 1.1 完成后可并行；一个主要修改 route/component UI，一个主要修改 PWA 静态资源和 HTML。
- 3.1 的测试草稿可在 2.1 后提前编写，但最终验收依赖 2.2 文案和状态稳定。

## 阻塞项

- （无）
