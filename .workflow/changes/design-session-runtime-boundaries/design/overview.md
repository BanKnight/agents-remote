# Design Overview

本文件汇总 `design-session-runtime-boundaries` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：design-session-runtime-boundaries
- 所属 version：v0.3-session-runtime-quality

## 输入依据

- intents：用户要求明确区分 Agent Session 与 Terminal Session，第一轮用 `tmux + xterm.js + WebSocket` 跑通真实 CLI，但稳定命名、接口、路由、metadata 和生命周期不能被 tmux/xterm 细节绑定。
- specs：`specs/session-runtime/spec.md`
- 相关长期 docs：
  - `docs/research/agent-access-options.md`
  - `docs/design/agent-session-model.md`
  - `docs/architecture/agent-runtime.md`
  - `docs/architecture/monorepo-service-boundaries.md`
  - `docs/architecture/project-boundary.md`
  - `docs/specs/agent-access/spec.md`
  - `docs/specs/project-model/spec.md`
  - `docs/specs/project-safe-paths/spec.md`
  - `docs/specs/service-access-boundary/spec.md`
  - `docs/specs/personal-app-config/spec.md`
  - `docs/design/console-shell.md`
  - `docs/design/frontend-stack.md`
- 代码现状：`api` 只有 auth/project/echo WebSocket；`packages/shared` 已有最小 Agent/Terminal Session 类型；`runtime-dir` 已提供 `/run/agents-remote` 边界；tmux/xterm/session runtime 尚未实现。

## 设计范围

### 本次覆盖

- Agent Session 与 Terminal Session 的产品和控制面语义边界。
- internal session id、display name、provider/native id、tmux resource name 的身份分层。
- runtime metadata 存储边界和运行态资源映射。
- 第一轮生命周期状态、关闭语义、重连语义和底层 runtime 缺失处理。
- `/api` HTTP 与 WebSocket 入口形态、auth 和错误语义。
- Terminal Session 第一条端到端链路如何承载后续实现与 E2E。

### 本次不覆盖

- 不实现 tmux、xterm.js、PTY、WebSocket stream 或 provider adapter 代码。
- 不定义 Claude/Codex provider-native thread/turn/event 的最终协议字段。
- 不提供跨服务器重启后的完整恢复；runtime metadata 丢失后不恢复历史运行实例。
- 不做完整 React 原生 Agent UI、Files/Git capability、快捷键配置界面或终端日志持久化。
- 不管理 Claude/Codex CLI 安装、登录、模型配置或账号状态。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 是 | 需要把用户可见的 Agent/Terminal 语义、入口和非目标固定下来。 |
| ui-ux | 否 | 具体移动端终端显示、快捷键和输入辅助属于后续 `implement-mobile-session-interaction`。 |
| frontend | 否 | 本 change 不定义 React 组件结构；只通过 API/产品语义约束后续页面。 |
| architecture | 是 | 需要定义 runtime、registry、metadata、tmux adapter、WebSocket transport 和 provider adapter 的边界。 |
| api | 是 | 需要定义 HTTP/WS 入口、DTO、auth、close/reconnect/list/detail/create 行为。 |
| data | 是 | 需要定义运行态 metadata 模型、runtime dir 边界、session id 和 tmux name 映射。 |
| business-rules | 是 | 需要定义生命周期状态、创建/关闭/reconnect/list 清理等业务规则。 |
| error-handling | 是 | 需要定义 runtime 缺失、transport 断开、provider 未配置、关闭失败等错误语义。 |
| risks | 是 | 需要集中收口 terminal passthrough 泄漏、metadata 丢失、多客户端等跨域风险。 |

## 总体设计结论

- `AgentSession`、`TerminalSession`、`transportSession`、`conversationThread` 和 `turn/run` 是不同概念；第一轮只实现前两者和 transport 连接语义，后两者作为 provider-native 演进边界保留。
- 控制面主键使用 internal stable session id；provider-native id、tmux name、socket id、transcript path 只能进入 metadata/internal diagnostics。
- 第一轮 runtime registry 以 `/run/agents-remote` 下的运行态 metadata 为权威，不写入 Project 目录或 `~/.agents-remote`，服务器重启后丢失符合预期。
- Terminal Session 是第一条真实端到端链路；Agent Session 第一轮也可走 CLI passthrough，但 API/文案必须保持 Agent 语义和 provider 字段。
- 关闭 session 表示终止底层 runtime；断开 WebSocket 只是 transport 断开，不等同于 session closed。

## 关键决策

- 用 `project + sessionId` 定位详情页和 API 资源，避免名称、provider id 或 tmux name 影响路由稳定性。
- session runtime API 位于 `/api/projects/:projectName/agent-sessions` 与 `/api/projects/:projectName/terminal-sessions`；stream 位于 `/api/projects/:projectName/{agent-sessions|terminal-sessions}/:sessionId/stream`。
- session registry 是 `api` runtime 内部模块；`packages/shared` 只承载 DTO、状态枚举和错误码。
- tmux resource naming 使用安全 slug/hash + type/provider + short id，metadata 负责关联原始 Project 名和展示名称。
- 列表读取时可以清理已不存在的底层 runtime；详情重连发现 runtime 缺失时显示 ended 并返回列表。

## 开放问题

- 多客户端同时连接同一个 session 时，第一轮是否允许多个 writer，还是采用“最后连接者可写 / 其他只读观察”的策略；本 change 暂不锁定。
- Agent `idle/waiting_input` 的可靠检测可能依赖 provider CLI 输出或后续 provider adapter，第一轮允许只在可观察时表达，不强制完整推断。
- 终端 scrollback 大小、backpressure 和二进制输出处理需要在实现 tmux/xterm/WebSocket 时实测确定。

## 后续沉淀候选

- `docs/specs/session-runtime/spec.md`：长期 WHAT。
- `docs/design/session-runtime-boundaries.md`：Agent/Terminal/transport/conversationThread 边界。
- `docs/architecture/session-runtime.md`：registry、metadata、tmux adapter、stream transport 的系统级 HOW。
