# plan

## Change 目标

- 建立第一轮 Bun monorepo 工程骨架，包含 `web`、`api`、`packages/shared` 三个工作区。
- 固定 `web/api/shared` 的职责边界和同域 `/api` 访问形态，为后续配置、认证、Project、Session Runtime、PWA 和 E2E changes 提供统一入口。
- 提供足够的基础脚本和最小验证端点，让后续实现可以验证 workspace、类型边界、HTTP proxy 和 WebSocket proxy 的基础可用性。

## 局部 big picture

- 本 change 是 v0.1 的工程骨架基础；后续大多数 change 都会依赖它提供的目录、脚本、包边界和 `/api` 访问约定。
- `configure-personal-app-settings` 会在此基础上接入配置、端口、token 和 runtime dir；因此本 change 只提供默认开发形态和最小 smoke 能力，不实现认证或个人配置文件。
- `build-responsive-pwa-console-shell` 会在 `web` 基础上实现具体页面和 PWA；因此本 change 只建立 React/Vite/Tailwind/TanStack/Jotai 工程入口，不设计具体 UI。
- `setup-e2e-quality-baseline` 会承接真实 E2E；因此本 change 只提供基础测试/检查脚本和可被 E2E 复用的 smoke endpoint，不定义 E2E 场景。

## 执行策略

- 先建立根 workspace 和共享 TypeScript 基础，再创建 `packages/shared` 类型包，避免 `web` 与 `api` 后续各自定义 DTO。
- 再创建 `api` 的 Bun HTTP/WebSocket 服务骨架，服务命名保持为 `api`，并提供最小 `/api/health` 与 `/api/ws/echo` 级别的边界验证能力；这些只用于服务和代理 smoke，不代表业务 API。
- 然后创建 `web` 的 React + TypeScript + Vite + Tailwind 基础，使用相对 `/api` 路径和 Vite dev proxy 访问 `api`，不暴露普通用户手动填写 API 地址的入口。
- 最后补齐根脚本、类型检查、基础测试/质量入口和部署路径说明，验证 workspace、依赖方向、HTTP proxy、WebSocket proxy 和 shared 类型边界。
- 具体依赖版本在实现阶段需要遵守 design 中的供应链约束：不要直接锁定发布不足 7 天的 npm latest；如确需最新版本需用户确认。

## 任务顺序依据

- 根 workspace、TypeScript 配置和 `packages/shared` 是所有后续代码的依赖，必须先完成。
- `api` smoke endpoint 必须先于 `web` proxy 验证存在，否则无法判断 `/api` 代理是否真实可用。
- `web` 工程依赖根 workspace、shared 类型和 api target 约定，因此排在基础与 api 之后。
- 文档/脚本/验证放在最后，因为它们需要反映实际创建的目录、命令和代理配置。
- 当前 change 的任务大多会修改根配置、workspace 配置和脚本，文件冲突较多，不适合高并行；只有部署说明和部分验证脚本可在骨架稳定后并行收口。

## 额外上下文

- `docs/project.md`：确认项目是 Web/PWA 控制服务器 Claude/Codex Agent 的控制面，服务边界需要支持后续 Agent Runtime。
- `docs/specs/agent-access/spec.md`：确认第一轮真实可用链路允许 CLI passthrough，但不能把 terminal/provider 细节固化为长期 Agent protocol；本 change 需要保护 `web/api/shared` 边界不提前泄漏 Agent Runtime 细节。
- 当前代码入口：仓库当前没有 `package.json`、`web/`、`api/`、`packages/shared/`、`tsconfig` 或 Vite 配置，implement-change 应从空工程骨架创建这些入口。
- 无需读取外部仓库源码；本 change 不复用 hapi/remodex 代码，只消费长期 agent-access 约束。
- 实现阶段需要联网安装依赖时，应在执行前确认或通过现有包管理约束选择稳定版本；不得自动采用刚发布不足 7 天的 npm latest。

## 依赖与阻塞

### 阶段依赖

- 已完成 specs 与 design，可进入实现准备；当前无 roadmap 前置依赖。
- 本 change 完成后会解锁 `configure-personal-app-settings`、`build-responsive-pwa-console-shell`、`setup-e2e-quality-baseline` 的工程入口。

### 任务依赖

- 根 workspace 与 TypeScript 基础阻塞所有后续任务。
- `packages/shared` 类型包阻塞 `web` 与 `api` 的共享类型导入。
- `api` smoke endpoint 阻塞 `web` dev proxy 的 HTTP/WebSocket 验证。
- `web` 工程基础阻塞前端脚本、Tailwind、TanStack/Jotai 边界验证。
- 部署说明和最终验证依赖实际脚本与服务入口完成。

### 外部依赖

- 需要 Bun 可用；如本机 Bun 不可用，implement-change 应阻塞并提示环境缺失。
- npm/Bun registry 访问可能需要网络权限；如果无法安装依赖，implement-change 应记录阻塞而不是手写伪 lockfile。
- Cloudflare Tunnel 不作为外部执行依赖；只写路径转发说明。

## 并行机会

- 根 workspace、shared、api、web 基础任务因配置和依赖链重叠，不建议并行。
- api smoke endpoint 完成后，部署说明可与 web 样式/状态基础收尾并行，因为它只读取既定路径约定，不修改同一核心配置。
- 最终验证任务不能并行提前执行，必须等待根脚本、api、web 和 proxy 都完成。

## 风险与验证重点

- 供应链风险：实现时必须避免直接锁定发布不足 7 天的 Vite/Tailwind/TanStack/Vitest latest，除非用户确认。
- 边界风险：`packages/shared` 只能放类型、状态枚举和 DTO，不能放路径解析、provider adapter、runtime control 或业务流程。
- 代理风险：开发环境必须通过 `/api` 相对路径访问 api，并验证 HTTP 与 WebSocket proxy；不要默认启用 `rewriteWsOrigin`。
- 命名风险：后端服务和包名必须使用 `api`，不要引入 `agent` 作为服务名。
- 范围风险：当前 change 的 `/api/health` 和 WebSocket echo 只用于边界验证，不扩展为业务 API、auth、Project 或 Session Runtime。

## 不做事项

- 不实现登录、token、配置文件、端口配置、runtime dir 或 Cloudflare 管理。
- 不实现 Project、AgentSession、TerminalSession、Files、Git 的业务 API。
- 不实现 PWA 页面、响应式控制台 UI、具体路由页面或组件库。
- 不实现真实 E2E；只保留基础测试和 smoke 检查入口。
- 不把 `api` 改成托管 `web` 的一体化服务。
- 不把 provider-native、tmux、xterm 或 Agent Runtime 细节放入 `packages/shared` 的第一轮骨架。
