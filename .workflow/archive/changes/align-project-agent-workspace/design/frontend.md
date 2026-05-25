# Frontend Design

## Change

- change-id：align-project-agent-workspace

## 前端范围

- 技术栈沿用现有 `web`：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Tailwind CSS。
- 修改范围集中在 `web/src/routes/ProjectConsoleRoute.tsx` 的 Agent workspace 子树。
- 继续使用 `listAgentSessions`、`createAgentSession`、`closeAgentSession`、TanStack Query/Mutation 和 shared `AgentSession` / `AgentProvider` DTO。
- 不修改 API client、shared DTO、后端 runtime 或 router path/search schema。

## 模块划分

- `ProjectConsole` 继续负责 Project scope、workspace search、query/mutation wiring 和二级 shell。
- `AgentPanel` 负责 Agent workspace header、provider create actions、error 状态、当前 instances 列表和 history/future restore 区域。
- `SessionCard` 可以被拆成 agent-specific row 与 terminal-specific row，或通过 props 扩展；但不应为假 history/summary 添加不存在的数据字段。
- `SessionList` 可调整密度和滚动行为，以支持当前 Agent instances 列表的扫读。
- `ProjectSignals` 可保持后置或轻量化，不应阻塞 Agent workspace 主任务。

## 组件边界

- Provider 创建按钮只发出 provider id；不负责 provider availability 探测或 account 配置。
- Agent instance row 只展示 `AgentSession` 的真实字段：`provider`、`displayName`、`status`、`id`，并提供 Open stream 和 Close。
- History/future restore 组件不接收真实 history 数据；当前只能展示 staged capability 说明、空态或 disabled affordance。
- Shared primitives 继续只承担视觉基础；不新增通用 Agent component library。

## 状态管理

- 服务端状态：Agent sessions list 使用 TanStack Query；create/close 使用 TanStack Mutation。
- 路由状态：Project workspace active state 继续由 `?workspace=agents|files|git|terminal` 承载；本 change 不新增 search param。
- 表单状态：无新增表单。
- 交互状态：关闭确认继续使用现有 confirm；history 区域无需 local state。
- 全局状态：不新增 Jotai atom。

## 路由 / 页面接入

- Project route 保持 `/projects/$projectName?workspace=agents`。
- 从 Agent row 打开 detail 继续使用 `/projects/$projectName/agent-sessions/$sessionId`，并保留 `search: { workspace: "agents" }` 作为返回/上下文一致性。
- 移动端 direct secondary page 继续显示 Project mobile workspace navigation；Agent detail 不在本 change 修改。

## 工程约束

- 不新增依赖、不引入图标包、不新增 API 字段。
- 不伪造 provider history、recent output、task summary、relative time 等当前 DTO 不提供的数据。
- 保留 create/close error、loading、empty、disabled/pending 和危险 close confirm。
- 实现后运行 format/lint/web typecheck/test/build，并用真实浏览器检查 desktop/mobile Agent workspace。

## 关键决策

- 将本 change 限制为 Project Agent workspace UI 结构与真实数据呈现，不扩大到 provider runtime 能力。
- 使用当前 `AgentProvider` union 直接渲染 provider marker 和 create actions。
- History 区作为 staged capability 说明，不实现 fake rows。
- 如果需要更紧凑的 Agent row，优先在 `ProjectConsoleRoute.tsx` 内局部实现，避免 premature abstraction。

## 风险与权衡

- Prototype 中 Agent cards 包含 output/task summary；当前真实字段不足，不能照搬。实现要牺牲部分视觉相似度以保持数据真实性。
- `SessionCard` 同时服务 Agent 和 Terminal；若为 Agent 过度改造，可能影响 Terminal workspace。必要时拆分 agent-specific row，避免影响 Terminal。
- 移动端底部二级导航占用高度；Agent list 和 history 区应留足底部 padding 或避免被遮挡。

## 开放问题

- 无阻塞开放问题；真实 provider history/resume 数据能力后续单独设计。

## 后续沉淀候选

- Agent workspace 的前端状态边界：当前 instances 使用 Query，provider create/close 使用 Mutation，history staged 区不伪造数据。
