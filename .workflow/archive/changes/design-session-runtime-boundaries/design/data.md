# Data Design

## Change

- change-id：design-session-runtime-boundaries

## 数据范围

- 只覆盖当前 api 运行实例的 session runtime metadata。
- metadata 用于把 internal session id、Project、session 类型、provider、展示名称和底层 runtime resource 关联起来。
- metadata 默认位于 `AGENTS_REMOTE_RUN_DIR` 或 `/run/agents-remote` 下，不属于长期配置、Project 文件或历史存储。

## 数据模型

### SessionMetadata

- `id`：本项目 internal stable session id；opaque，不由调用方解析。
- `projectName`：Project 控制面名称，用于 API/URL scope。
- `projectPath`：经 Project safe path resolver 得到的真实 Project 路径；用于 runtime cwd。
- `type`：`agent` 或 `terminal`。
- `provider`：仅 Agent Session 有值，`claude` 或 `codex`。
- `displayName`：用户可见名称，可自动生成。
- `status`：第一轮状态，Agent 与 Terminal 使用各自允许集合。
- `tmuxSessionName`：底层 tmux resource name，内部使用。
- `createdAt` / `updatedAt` / `lastConnectedAt`：运行态排序和诊断用时间戳。
- `runtimePid` 或等价 diagnostics：可选，仅用于诊断，不作为 API 主键。
- `schemaVersion`：metadata 文件版本，用于后续兼容。

### 派生关系

- `AgentSession` DTO 从 `SessionMetadata(type=agent)` 派生。
- `TerminalSession` DTO 从 `SessionMetadata(type=terminal)` 派生。
- Project summary 的 `agentSessionCount` / `terminalSessionCount` 可从 registry 中仍存在的活跃 metadata 派生，不需要写回 Project 模型。

## 表结构 / 字段

- 第一轮不引入数据库表。
- metadata 可以使用一个 registry index 文件加每个 session 一个 metadata 文件，或实现阶段选择等价结构；设计约束是：
  - 可按 Project + type 列表读取。
  - 可按 session id 定位。
  - 可校验 metadata 对应底层 tmux runtime 是否仍存在。
  - 写入不会进入 `packages/shared`、Project 目录或 `~/.agents-remote/config.toml`。

## 迁移策略

- 当前没有历史 session metadata，需要新增即可。
- metadata 使用 `schemaVersion`，后续字段增加应兼容旧文件；无法兼容时可以丢弃对应运行态 metadata，因为第一轮不承诺跨版本/重启历史恢复。
- 如果 metadata 损坏，系统应跳过或清理该运行实例记录，而不是阻塞整个 Project 列表。

## 索引与查询

- 主要查询模式：
  - 按 Project 列出 Agent Sessions。
  - 按 Project 列出 Terminal Sessions。
  - 按 Project + type + session id 获取详情。
  - 按 session id 找到 tmux resource 以 attach/close。
- 数据量预计为个人部署下少量活跃会话；第一轮不需要复杂索引。
- 如果实现使用文件系统，目录可按 project-safe key/type/session id 分层，避免每次全局扫描大量文件。

## 一致性与事务

- 创建 session 的一致性边界：底层 runtime 启动成功后写 metadata；若 metadata 写入失败，应终止刚创建的 runtime 或返回失败并避免 orphan runtime。
- 关闭 session 的一致性边界：先尝试终止底层 runtime，再标记/删除 metadata；如果 runtime 已不存在，metadata 可直接清理。
- WebSocket attach 不创建新的 Agent/Terminal Session，只更新 transport diagnostics，如 `lastConnectedAt`。
- 列表读取可以做 best-effort stale cleanup；清理失败不应阻塞读取其他 session。

## 关键决策

- 不把运行态 metadata 放进长期数据库，是为了保持第一轮简单，并符合 `/run/agents-remote` 的运行态边界。
- `tmuxSessionName` 是内部 resource id，不进入公共 DTO；公共 DTO 只暴露 `id`、`projectName`、`displayName`、`status` 和 Agent provider。
- `projectPath` 可以保存在 metadata 作为创建时解析结果，但请求处理仍应用 Project scope 校验，防止 metadata 被误用访问越界路径。

## 风险与权衡

- 文件 metadata 在并发创建/关闭时可能需要锁；如果 api 只有单进程，复杂度可延后。
- run dir 被清理会丢失 session 列表；这是当前 scope 可接受行为。
- 保存 `projectPath` 可能在 Project 目录被移动后过期；实现时应优先校验 Project 仍可解析。

## 开放问题

- metadata 是否需要独立 lock 文件，取决于实现时是否支持多 api 进程或重入写入。
- 是否保留 closed metadata 的短暂 tombstone 以支持详情页显示 ended，还是立即删除并由 API 返回 missing。

## 后续沉淀候选

- 运行态 metadata 模型和 runtime dir 边界可沉淀到 `docs/architecture/session-runtime.md`。
