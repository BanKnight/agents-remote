# project

本文件记录项目认知 big picture。它帮助新成员或 Agent 在开始局部工作前，快速理解项目是什么、服务谁、核心边界在哪里，以及应该优先加载哪些参考文档。

本文件只写已经确认或可以从项目事实可靠推导的内容；不记录单次需求、任务状态或临时实现过程。

## 项目定位

- 构建一个优化版本的 hapi，提供网页控制平面，用于管理与控制服务器上的 Agent 会话与执行。
- 首期必须支持至少两类 Agent：Codex 与 Claude，并为后续扩展其他 Agent 保留统一接入面。
- 产品优先面向个人私有部署和小团队远程操作：浏览器是主要入口，服务器侧负责真实运行 Agent、Terminal、Git 和文件检查能力。

## 用户与场景

- 主要用户是需要远程调度与观察 Agent 的操作者，包括个人开发者和小团队成员。
- 核心场景是在浏览器中进入某个服务器 Project，发起、控制、查看和恢复 Agent/Terminal Session，而不依赖本地终端常驻操作。
- 移动端是首轮体验重点：登录后应能在手机竖屏里完成 Project 选择、会话查看、输入发送、文件预览和 Git diff inspection。

## 核心领域概念

- **Web Control Plane**：浏览器端与服务端控制 API 组成的控制层，负责任务发起、状态可视化与操作入口。
- **Console Shell**：登录后的 Web/PWA 控制台外壳，以 Project 为作用域，默认聚焦 Agent Sessions，并提供 Terminal、Git、Files 的辅助入口。
- **Project**：`PROJECTS_ROOT` 下的一级真实目录，是控制台、Files、Git、Terminal Session 和 Agent Session 的统一作用域；第一轮不需要数据库注册。
- **PROJECTS_ROOT**：个人部署配置中的绝对路径，是当前服务器内 Project 能力和 project-scoped 路径访问的根信任边界。
- **Session Runtime**：Project-scoped Agent Session 与 Terminal Session 的运行态能力；使用 internal session id、runtime metadata 和明确的 reconnect/close 语义连接浏览器控制面与服务器运行实例。
- **Agent Runtime**：服务器上的 Agent 执行环境，负责 Agent Session 生命周期、provider CLI/adapter 启动与结果回传；当前重点对接 Codex 与 Claude。
- **Provider**：Agent Runtime 背后的具体 Agent CLI 或执行器，例如 Claude 与 Codex；用户操作层应尽量看到统一会话语义，而不是 provider 内部差异。

## 代码与文档结构

```text
agents-remote/
├── web/              # 前端控制台：页面、交互、浏览器侧 /api client、PWA 静态资源从这里开始找
│   └── src/i18n/     # 轻量国际化：typed keys、I18nProvider、中英双语、navigator.language 检测
│   └── src/components/shell/icons/  # SVG 图标资源 + ShellIcon 统一组件
├── api/              # Bun 服务端：认证、配置、Project、Files/Git、Session、Agent runtime API 从这里开始找
├── packages/shared/  # web/api 共享协议：DTO、状态 union、错误码；跨边界类型先看这里
├── e2e/              # Playwright 端到端测试：真实浏览器用户路径从这里开始找
├── scripts/          # 开发与验证脚本：E2E harness、临时环境编排等从这里开始找
├── docs/             # 长期参考文档：specs/design/architecture/runbooks/research 按任务类型加载
├── .workflow/        # 工作流运行态：由 workflow 技能维护，业务开发通常只读取当前 change 上下文
└── package.json      # Bun workspace 与根级质量门禁入口
```

本节只提供探索入口，不维护源码文件清单；需要具体实现位置时，优先从对应目录的命名、测试文件和相关长期文档继续搜索。

## 技术与架构概览

- Monorepo 使用 Bun workspaces：根包编排 `web`、`api` 与 `packages/*`。
- 前端栈是 React 19、Vite、TypeScript、TanStack Router、TanStack Query、Jotai、Tailwind CSS；Project 直接二级 workspace active 状态属于 URL-visible route/search 状态，不应只放在 Jotai。
- 国际化使用轻量自研方案（`web/src/i18n/`）：`I18nProvider` + `useT()` hook，无第三方依赖。支持中英双语，默认跟随 `navigator.language`（`zh*` → 中文，其余 → 英文），用户可通过 `localStorage["lang"]` 覆盖。所有面向用户的字符串（~180 条）按域组织为 typed translation key，TypeScript 强制 key 一致性。
- Home / Projects 是一级 Project entry：默认优先展示可扫读 Project 列表和进入行为，Create/adopt Project 是低频入口，只有无 Project、提交中或错误时才提升为可恢复主路径。
- Agent/Terminal Session detail 是 runtime 深层工作台：共享 terminal-first 主输出和底部 input drawer（折叠状态持久化）；Agent detail header 使用 icon-only action buttons（Files/Git/+Terminal/Close）with native tooltip，Agent detail 可提供 Files/Git/+Terminal contextual tools；Terminal detail 保持 focused shell，不混入 Agent-only tools。
- Project Agent workspace 是默认运行态二级页：优先展示 `+ Claude` / `+ Codex` 创建入口和当前 Agent instances；provider history / future restore 在真实 API 完成前只作为 staged 辅助区，不混入当前实例列表。
- Project Files/Git/Terminal 是直接二级 resource workspaces：Files/Git 保持只读 inspection，Terminal workspace 只列 live Terminal instances 并提供 create/open/close；Files preview 和 Git single-file diff 在移动端是顶部返回的深层 detail，不显示 Project 二级底部导航。
- TanStack Query 负责服务端状态；Jotai 只用于 shell 级共享 UI 状态（如 input drawer 折叠状态使用 `atomWithStorage` 持久化到 localStorage）；文件选择、当前路径、当前 diff 文件等局部 section 状态优先留在组件内。
- 服务端运行在 Bun 上，Project-scoped 能力优先使用 Web 标准 `Request` / `Response` 边界和 shared DTO。
- 系统分为网页控制层与服务器执行层：前者聚焦控制体验，后者聚焦 Agent 调度、tmux/CLI adapter 和执行稳定性。
- Project 模块统一负责 Project 列表、创建/采用和 `PROJECTS_ROOT` 安全路径解析；Files、Git、Terminal 和 Agent 等下游能力必须复用 Project-safe 解析。
- 当前 Files/Git inspection 是只读能力；Agent/Terminal Session 是真实运行态能力；二者在 UI 中都属于 Project Console 的辅助工作区。
- PWA 提供 manifest/icons/meta、standalone 外壳、应用内安装入口和 service worker 静态安装资源缓存；service worker 不缓存导航 HTML、不拦截 `/api`，避免 installed PWA 卡旧页面或伪造离线数据。PWA 标题为「智控 · AI 远程控制台」，使用 AI+远程控制结合的 SVG 图标。
- SVG 图标系统（`web/src/components/shell/icons/`）：一个 `.svg` 资源文件对应一个图标，通过 `<ShellIcon name="...">` 组件统一引用（Vite `?raw` import + `dangerouslySetInnerHTML`）。新增图标只需添加 `.svg` 文件并在 `svgMap` 注册。包括厂商 logo（Anthropic/OpenAI）、导航图标、功能图标（close/refresh/terminal/file/folder）等。
- 当前没有独立数据库模型；Project identity 来自 `PROJECTS_ROOT` 下一级目录，session runtime metadata 存在 runtime dir 边界内。

## 容易犯错的边界

- 不要把客户端传入的 project name、relative path、Git path 或 shell working directory 当作可信输入；所有 Project-scoped 文件系统能力都必须先经过 Project-safe resolver。
- 不要用 shell 字符串拼接执行 Git、tmux 或 provider CLI；系统命令必须使用 argv 数组，并在调用前完成 Project/path/provider 输入校验。
- 不要把 provider 差异直接泄漏成用户必须理解的控制面模型；Claude/Codex 差异应收敛在 provider profile、adapter 或 capability 边界内。
- 不要为了移动端布局隐藏问题而只加全局 `overflow-hidden`；应检查动态视口高度、局部滚动区、`min-w-0`、长文本截断/换行和固定区域是否挤占内容。
- 不要在 Project 工作区常驻固定底部 runtime input；真实输入应进入 Agent/Terminal Session detail 后出现，并且输入区不能遮挡输出。
- 不要反复启动新的 web/api 端口来验证问题；调试服务必须常驻在明确命名的 tmux session 中，固定使用 API `43011`、Web `43012`，后续测试应复用或重启同一 session，避免端口漂移。
- **API 和 Web 进程必须在 tmux session 里启动和管理**，不能在 tmux 外直接运行（否则进程变成孤儿进程，无法通过 tmux 控制）。重启 API 的正确方式是：在 `ar-dev:0` 里发 `C-c` 停止当前进程，再重新运行 `bun run --filter @agents-remote/api dev`。如果进程变成孤儿（PPID=1），只能用 `kill <pid>` 清理后再在 tmux 里重启。
- 开发/验证用 tmux session 统一使用 `ar-<purpose>` 命名，例如 `ar-dev`、`ar-e2e`、`ar-debug`；不要使用 `agents-remote-*`，避免和 Claude Code 当前会话或其他任务会话混淆，并便于 `tmux list-sessions | grep '^ar-'` 搜索、复用和关闭。
- Session runtime 的运行时标识符使用 `createRuntimeKey()` 生成 `{prefix}-{type}-{provider}-{projectKey}-{id}` 格式；生产环境默认前缀 `ar-`，E2E 环境通过 `AGENTS_REMOTE_SESSION_PREFIX=e2e-ar` 使用 `e2e-ar-` 前缀，确保 E2E 产生的标识符可区分，不与生产 session 混淆。
- E2E harness（`scripts/run-e2e.ts`）在独立临时目录启动 API/Web 进程，`finally` 块必须清理产生的 runtime session（按前缀 kill），避免孤儿进程积累导致系统负载升高。
- 不要把 `packages/shared` 当成通用垃圾桶；shared 只表达跨 web/api 的协议、状态和错误码，不放业务流程实现、服务端资源句柄或前端组件细节。

## 开发准则

### 通用执行顺序

1. 先读 `docs/project.md`，再按任务类型加载下方“重要文档列表”里的相关 specs/design/architecture/runbooks。
2. 明确本次改动属于哪一层：shared 协议、api 能力、web 交互、runtime adapter、E2E/质量基线，避免跨层随手重构。
3. 优先做最小闭环：先定义或确认行为契约，再改最少代码让该行为可运行、可观察、可测试。
4. 每次改动后运行与改动层级匹配的最小验证；收尾前再运行必要的完整质量门禁。
5. **每次 commit 前必须通过完整质量门禁**：`bun run format:check && bun run lint && bun run typecheck && bun run test`。lint 使用 `--deny-warnings`，0 warning 0 error 才算通过；test 必须全部 pass，不允许以"基线就有问题"为由跳过修复。

### 新增或修改跨边界 API

1. 在 `packages/shared/src/index.ts` 定义或调整 DTO、status union、error code。
2. 在 `api/src/*` 实现 service/route，并补充或更新同层单元测试。
3. 在 `web/src/api/client.ts` 接入 client 方法，保持错误处理和返回类型与 shared 协议一致。
4. 在 `web/src/routes/*` 接入 UI；server state 使用 TanStack Query，局部选择/展开/输入状态留在组件内。
5. 对用户可见路径补 E2E 或手动浏览器验证；涉及移动端时检查窄屏布局。

### 新增或修改 Project-scoped 能力

1. 先确认输入是否包含 project name、relative path、working directory 或 provider 参数。
2. 所有路径先通过 Project-safe resolver 收敛到 `PROJECTS_ROOT` 内，再传给 Files/Git/Terminal/Agent 下游逻辑。
3. Git/tmux/provider CLI 调用使用 argv 数组，禁止 shell 字符串拼接。
4. 测试至少覆盖合法路径、越界路径、缺失 Project、非预期文件类型或非 Git 目录等边界。

### 多语言（i18n）

- 所有面向用户的字符串（按钮、标签、提示、确认对话框、错误信息等）必须通过 `t("key")` 翻译，禁止在组件或 UI 层硬编码任何自然语言文本。
- 新增 key 时分别在 `web/src/i18n/en.ts` 和 `zh.ts` 补齐两种语言的翻译；`TranslationKey` 类型由 `keyof typeof en` 自动推导，TypeScript 强制 `zh` 与 `en` 的 key 集合完全对应，不允许只写一种语言就提交。
- 组件中跨页面复用的文本（如 Cancel/取消、Close/关闭）优先使用共享 key（如 `cancel`、`session.close`），不要为每个场景重复定义等价的 key。

### 前端与移动端开发

1. 先从 design/prototype 和对应能力 spec 理解目标信息架构，不要只根据当前组件外观猜测布局。
2. 手机竖屏优先：检查首屏密度、返回路径、主要内容滚动区、输入区是否遮挡输出、长文本是否导致横向溢出。
3. Home / Projects 首屏优先服务打开已有 Project；不要用大块说明、厚卡片或常驻创建表单挤占 Project 列表。
4. Project Agent workspace 首屏优先服务创建、扫描和进入当前 Agent instances；不要用假历史、假摘要或过多 metadata 替代真实 `AgentSession` 字段。
5. Agent/Terminal Session detail 首屏优先服务查看 runtime output 和发送输入；Agent contextual tools 只能辅助进入 Files/Git/+Terminal/Meta，不能挤占 terminal-first 主区或污染 Terminal focused shell。
6. Files/Git/Terminal resource workspaces 应优先服务 inspection 和 instance list 本身；Files/Git 不出现写操作，Terminal direct secondary 不出现 runtime input，移动端 preview/diff deep detail 必须用顶部返回并隐藏 Project 二级底部导航。
7. Agent/Terminal Session detail 使用紧凑 header、主输出区、非遮挡输入区和 quick keys；输入行为要用真实浏览器路径验证。

### 测试与质量门禁

1. 改 shared 协议：运行 `bun run --filter @agents-remote/shared test` 和相关 typecheck。
2. 改 api：运行目标 `api/src/*.test.ts` 覆盖的测试；涉及路由或 runtime 时补充集成路径验证。
3. 改 web：运行相关 `web/src/**/*.test.ts`，并用浏览器验证对应页面的 golden path 和错误/空状态。
4. 改 Project/Session/Terminal/WebSocket：运行 `bun run e2e` 或对应 E2E 子路径，确认真实浏览器、tmux 和 stream 行为。
5. 收尾前按风险运行根级质量门禁：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`；如果改动影响端到端用户路径，再加 `bun run e2e`。
6. 需要长驻 web/api 调试服务时，用 `ar-dev` tmux session 管理并固定端口：API `43011`、Web `43012`；查看日志、重启、关闭都通过同一 session 完成，避免孤儿进程和端口漂移。

## 重要文档列表

### 原型与产品体验

- [导航结构 HTML 原型](./design/prototype/index.md) — 当前 UI/UX 对齐的主入口，覆盖首页一级导航、Project 二级导航、Agent/Files/Git/Terminal 页面、terminal-first instance detail，以及桌面端/移动端布局形态。
- [Frontend UI architecture](./design/frontend-ui-architecture.md) — UI/UX prototype alignment 的长期设计基线，定义来源优先级、三层页面模型、移动端返回规则、共享 UI 边界和视觉密度基线。
- [Prototype 设计规范](./design/prototype/guidelines.md) — 定义 prototype 页面的导航、布局、组件、配色、间距和移动端直接二级页/深层详情页返回规则。
- [Prototype 截图索引](./design/prototype/screenshots/index.md) — 保存各独立原型页的桌面端和移动端浏览器渲染截图，用于评审、对齐和回归对比。
- [Console Shell 设计](./design/console-shell.md) — 登录后 Project Console 的信息架构、移动 Project 工作区顺序、输入职责边界和 PWA 外壳设计。
- [移动端 Session 交互设计](./design/mobile-session-interaction.md) — Agent/Terminal Session detail 的移动端工作台布局、非遮挡输入区、quick key 和恢复状态规则。
- [前端栈设计](./design/frontend-stack.md) — `web` 前端路由、服务端状态、本地 UI 状态和 `/api` 调用职责边界。

### 行为规格与能力契约

- [Workspace Foundation 规格](./specs/workspace-foundation/spec.md) — monorepo、Bun 命令面、前端基础、共享类型边界和基础质量入口。
- [Private Access Auth 规格](./specs/private-access-auth/spec.md) — 单密码登录、本地 token、HTTP/WebSocket 认证和个人私有部署安全范围。
- [Project Model 规格](./specs/project-model/spec.md) — `PROJECTS_ROOT` 一级目录 Project 模型、Project identity、列表摘要和创建/采用行为。
- [Project Safe Paths 规格](./specs/project-safe-paths/spec.md) — Project 名称与 project-relative path 的统一安全解析契约。
- [Project Console Navigation 规格](./specs/project-console-navigation/spec.md) — 定义一级应用 shell、Project 二级 workspace、URL-visible workspace 状态、移动端返回模型和输入职责边界。
- [Prototype Assets Guidelines 规格](./specs/prototype-assets-guidelines/spec.md) — 定义 HTML prototype 资产、overview 总览、截图来源、viewport、guidelines 和跨页面 foundation 的长期行为契约。
- [Session Runtime 规格](./specs/session-runtime/spec.md) — Agent/Terminal Session 身份分层、runtime metadata、tmux resource、reconnect 和 close 行为契约。
- [Agent Provider Experience 规格](./specs/agent-provider-experience/spec.md) — Claude/Codex provider 入口、统一 Agent Session 语义和 provider-aware list/detail 边界。
- [Files 规格](./specs/file-browser-preview/spec.md) — 只读浏览、安全路径、隐藏条目、文本/图片预览、错误状态和移动端紧凑 inspection 要求。
- [Git Diff 规格](./specs/git-diff-viewer/spec.md) — 只读 Git status/diff、非 Git 状态、worktree/staged 列表、单文件 unified diff 和移动端 inspection 要求。
- [E2E Quality Baseline 规格](./specs/e2e-quality-baseline/spec.md) — 登录到 Terminal Session 真实 tmux/WebSocket 输入输出的自动化 E2E baseline 要求。

### 架构、接口与运行边界

- [Monorepo Service Boundaries](./architecture/monorepo-service-boundaries.md) — `web`、`api`、`packages/shared` 的工程结构、服务边界与同域 `/api` 部署路径约定。
- [Project Boundary](./architecture/project-boundary.md) — Project 模块、安全路径解析和下游 project-scoped 能力的长期架构边界。
- [Session Runtime 架构](./architecture/session-runtime.md) — SessionRegistry、runtime metadata、tmux adapter、HTTP/WS stream 和 transport 边界。
- [Agent Runtime 架构](./architecture/agent-runtime.md) — Agent Runtime、Provider Adapter、TerminalSession 与 capability extension 的长期架构边界。协议细节参见 [Claude CLI stream-json 协议](./research/claude-cli-stream-protocol.md)。
- [Claude2 进程模型与消息回放设计](./design/message-replay.md) — Claude2 直拉 CLI（`Bun.spawn`，非 tmux）+ JSONL history / 内存 live 双缓冲 relay + 单一 WS 流的管线设计，含 system.init/turn 边界与 reconnect/API 重启时序。
- [Files 架构](./architecture/file-browser-preview.md) — Files API、safe path 复用、只读 preview union 和文件系统读取边界。
- [Git Diff 架构](./architecture/git-diff-viewer.md) — Git diff API、Project-safe resolver 复用、只读 Git CLI 命令和 Git DTO 边界。
- [E2E Quality Baseline 架构](./architecture/e2e-quality-baseline.md) — Playwright + Bun E2E harness、临时环境、真实 tmux/WebSocket smoke 和 artifact 边界。

### 数据、配置与运维

- [个人部署配置 Runbook](./runbooks/personal-deployment-configuration.md) — 首次配置、环境变量覆盖、启动失败修正和 runtime dir 权限处理流程。
- [E2E Quality Baseline Runbook](./runbooks/e2e-quality-baseline.md) — 如何运行、验证和排查登录到 Terminal Session 的自动化 E2E quality baseline。
- [Claude2 客户端调试开关 Runbook](./runbooks/claude2-client-debugging.md) — 浏览器运行时调试开关（socket 日志、调试按钮，均默认关闭）的控制范围与切换方法。
- [Agent 接入调研](./research/agent-access-options.md) — hapi/remodex/Codex/Claude 接入路线、证据追溯和统一协议可能性调研。
- [Claude CLI stream-json 协议](./research/claude-cli-stream-protocol.md) — CLI stdio 协议完整参考：启动参数、消息类型、system.init 字段、model/permissionMode 权威来源规则、生命周期和集成边界。
- [Claude2 Replay 性能与验收基线](./research/claude2-replay-performance.md) — 长会话打开慢的分析依据：数据流成本模型、实测数字（客户端已排除，主因在传输）、实施路径与验收标准。
- 数据库参考：当前没有独立数据库 schema；Project 数据模型以 `PROJECTS_ROOT` 目录和 runtime metadata 为主，优先参考 Project/Session 相关规格与架构文档。
