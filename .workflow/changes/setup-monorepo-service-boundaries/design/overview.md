# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：setup-monorepo-service-boundaries
- 所属 version：v0.1-foundation-and-agent-research

## 输入依据

- intents：`.workflow/changes/setup-monorepo-service-boundaries/intents.md`
- progress：`.workflow/changes/setup-monorepo-service-boundaries/progress.md`
- specs：
  - `.workflow/changes/setup-monorepo-service-boundaries/specs/workspace-foundation/spec.md`
  - `.workflow/changes/setup-monorepo-service-boundaries/specs/service-access-boundary/spec.md`
- 相关长期 docs：
  - `docs/project.md`
  - `docs/specs/agent-access/spec.md`
- 技术研究基线：`.claude/skills/technology-research/references/default-web-stack.md`
- 当前资料确认时间：2026-05-24

## 设计范围

### 本次覆盖

- 定义第一轮 monorepo 工作区边界：根 workspace、`web`、`api`、`packages/shared`。
- 定义默认技术基础：Bun workspace/scripts/runtime，React + TypeScript + Vite，Tailwind CSS，TanStack，Jotai，基础测试命令入口。
- 定义 `web` 与 `api` 的服务边界：本机分离运行，对外统一入口，同域 `/api` HTTP/WebSocket 转发。
- 定义 `packages/shared` 的职责边界：只放跨 `web/api` 类型、状态枚举和 API DTO，不放业务逻辑、路径解析或 runtime 控制逻辑。
- 定义设计阶段的技术版本策略和供应链约束：不在 design 锁定发布不足 7 天的 npm 版本。

### 本次不覆盖

- 不实现仓库结构、脚本或依赖安装。
- 不设计登录、Project、Session Runtime、Files、Git 或 E2E 的业务 API。
- 不设计具体页面 UI、组件细节或移动端视觉布局。
- 不管理 Cloudflare Tunnel、域名、Cloudflare 认证或外部部署资源。
- 不把具体 E2E 链路写入当前 change；E2E 细节归属 `setup-e2e-quality-baseline`。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 本 change 不改变用户路径，只建立工程和服务入口边界。 |
| ui-ux | 否 | 不设计页面结构或视觉交互；PWA/暗色控制台由后续 UI changes 处理。 |
| frontend | 是 | 需要明确 React/Vite/Tailwind/TanStack/Jotai、前端状态分层和测试入口。 |
| architecture | 是 | 需要明确 monorepo 工作区、服务边界、依赖方向和演进策略。 |
| api | 是 | 需要明确 `/api` HTTP/WebSocket 路径、同域代理和调用边界。 |
| data | 否 | 当前不定义数据模型、存储或迁移。 |
| business-rules | 否 | 当前不定义业务状态流转。 |
| error-handling | 否 | 当前只涉及服务边界；具体 API 错误语义由后续能力 changes 处理。 |
| risks | 是 | 技术版本、代理安全、边界泄漏和 E2E 范围需要集中收口。 |

## 总体设计结论

- 仓库应作为 Bun-managed monorepo：根目录提供 workspace 和统一脚本入口，`web`、`api`、`packages/shared` 分别保持清晰职责。
- `api` 是后端服务唯一命名；不要把服务或包命名为 `agent`，避免与 Claude/Codex Agent provider 混淆。
- `web` 使用 React + TypeScript + Vite；Tailwind CSS 作为移动端优先深色界面的样式基础；TanStack 与 Jotai 是前端工程基础，分别承接路由/服务端状态和本地 UI 状态边界。
- 对外访问以同域路径为目标：`/api` 前缀进入 `api`，其余路径进入 `web`；开发环境通过 Vite dev proxy 模拟同样路径形态。
- WebSocket stream 也应位于 `/api` 前缀下；Vite proxy 支持 WebSocket，但不应默认启用 `rewriteWsOrigin`。
- Cloudflare Tunnel 只作为部署层示例目标，不由应用管理。

## 关键决策

- 使用 `web` / `api` / `packages/shared` 三个第一轮工作区，不引入 `agent` 工作区名称。
- `packages/shared` 只承载共享类型与 DTO；业务逻辑留在 `api` 或后续能力模块中。
- 第一轮只做本机双服务 + 同域代理，不做多 server/hub 管理。
- 技术版本在 design 中记录 major/方案，不锁定刚发布版本；plan/implement 阶段选择满足 npm 7 天规则的具体版本。
- 测试在当前 change 只保留基础命令入口；真实 E2E 链路由 `setup-e2e-quality-baseline` 设计。

## 开放问题

- TanStack 范围是否第一轮同时包含 Router 与 Query，还是先 Router + Query、Table/Form 按页面需要后续引入。
- 基础测试入口第一轮是否只使用 Bun test，还是同时为前端组件测试预留 Vitest。
- 对外生产部署是否要求项目提供 Cloudflare Tunnel 配置片段，还是只提供通用反向代理路径说明。

## 后续沉淀候选

- `docs/architecture/monorepo-service-boundaries.md`
- `docs/design/frontend-stack.md`
- `docs/runbooks/deploy-path-routing.md`
