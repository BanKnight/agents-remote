# Claude CLI stream-json 协议

本文档沉淀 Claude CLI (`claude`) 的 stdio stream-json 协议——它是 Agent Runtime 与 CLI 进程之间的通信契约，也是 model、permissionMode 等会话状态的唯一权威来源。

**目标读者**：需要实现兼容前端的开发者。读完本文档即可独立做出功能等价的前端。

## 概述

Claude CLI 通过 stdin/stdout 以 JSONL（每行一个 JSON）方式通信。消息类型分三类：

- **CLI stdout 实时流**：`system.*` / `assistant` / `user` / `result` / `control_request` / `control_response` / `mode`
- **CLI stdin 输入**：`user` / `control_request` / `control_response` / `keep_alive` / `update_environment_variables`（5 种顶层 type；`interrupt` / `set_model` / `set_permission_mode` 等是 `control_request` 的 subtype，详见 [control_request subtype 全表](#control_request-subtype-全表)）
- **JSONL 磁盘文件独有**：`attachment` / `last-prompt` / `ai-title` / `agent-name` / `permission-mode` / `mode` / `file-history-snapshot` / `queue-operation` / `custom-title`

其中 `system.*` 目前已知包含 `system.init`、`system.status`、`system.compact_boundary` / `system.microcompact_boundary`、`system.api_retry`、`system.api_error`、`system.turn_duration`、`system.thinking_tokens`、`system.task_started` / `system.task_updated` / `system.task_notification` / `system.task_progress`、`system.local_command`，以及运行时控制信号（`permission_denied`）。JSONL 独有类型是独立的顶层类型（如 `type: "attachment"`），**不是** `system` 子类型。

## 启动参数

我们使用以下核心参数：

| 参数                             | 用途                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `--output-format stream-json`    | stdout 输出 JSONL                                         |
| `--input-format stream-json`     | stdin 接受 JSONL                                          |
| `--verbose`                      | 输出 thinking / reasoning                                 |
| `--permission-prompt-tool stdio` | 权限请求走 stdin/stdout 而非 TUI                          |
| `--model <tier>`                 | 指定模型（可选，缺省用 CLI 默认）                         |
| `--permission-mode <mode>`       | 权限模式（可选，缺省用 CLI 默认）                         |
| `--resume <sessionId>`           | 恢复已有 session（可选，CLI 从自己的 JSONL 文件加载状态） |

## 协议类型总表

下面按 **CLI stdout**（CLI 输出）和 **CLI stdin**（我们写入 CLI）两个方向列出当前已知消息类型。后续各节再展开字段和处理方式。

列含义：**写入 JSONL** = CLI 是否将该消息写入磁盘 JSONL 文件；**新会话** / **resume 会话** = 该场景下此消息类型是否会出现。

### CLI stdout（CLI → 外部）

| 类型 | 子类型 / 形态 | 含义 | 写入 JSONL | 新会话 | resume 会话 |
|---|---|---|---|---|---|
| `system` | `init` | 会话元数据初始化（model, slash_commands, skills 等） | 否 | 是 | 是 |
| `system` | `status` | 权限模式切换 + compact 运行态通知 | 否 | 是 | 是 |
| `system` | `compact_boundary` | 上下文压缩边界 | 是 | 是 | 是 |
| `system` | `microcompact_boundary` | 微压缩边界 | 否 | 是 | 是 |
| `system` | `api_retry` | API 重试通知 | 否 | 是 | 是 |
| `system` | `api_error` | API 错误通知 | 是 | 是 | 是 |
| `system` | `thinking_tokens` | 推理 token 增量 | 否 | 是 | 是 |
| `system` | `task_started` | 子任务开始 | 否 | 是 | 是 |
| `system` | `task_updated` | 子任务状态更新 | 否 | 是 | 是 |
| `system` | `task_notification` | 子任务通知 / 完成 | 否 | 是 | 是 |
| `system` | `task_progress` | 子 agent 运行进度（挂载在 AgentTool 内部） | 否 | 是 | 否 |
| `system` | `permission_denied` | 自动权限拒绝 | 否 | 是 | 是 |
| `system` | `turn_duration` | turn 耗时统计 | 是 | 是 | 是 |
| `assistant` | 见下方 [assistant content 子类型](#assistant-messagecontent-子类型) | AI 回复流 | 是 | 是 | 是 |
| `user` | 见下方 [user 消息变体](#user-消息变体) | 用户输入 / 工具结果 / CLI 内部消息 | 是 | 是 | 是 |
| `result` | `success` / `error` / `interrupted` / `error_max_turns` | turn 结束 | 否 | 是 | 是 |
| `control_request` | `can_use_tool` | 权限请求（Bash, Write, AskUserQuestion 等） | 否 | 是 | 是 |
| `control_response` | `success` / `error` | 对客户端发起的 control_request（`set_model` / `set_permission_mode` / `interrupt`）的响应 | 否 | 是 | 是 |
| `mode` | `"normal"` | CLI 运行时心跳（**永远** `"normal"`，已在 111/111 条样本中验证）. 不是 permission mode 信号，不渲染到 UI | 是 | 是 | 是 |

### CLI stdin（外部 → CLI）

| 类型 | 含义 | 写入 JSONL | 新会话 | resume 会话 |
|---|---|---|---|---|
| `user` | 用户文本输入 | 是（处理后） | 是 | 是 |
| `control_request` | host 主动发起的控制请求，带 `request_id`，CLI 回 `control_response`。`subtype` 共 21 种（`interrupt` / `set_model` / `set_permission_mode` / `cancel_async_message` 等，详见 [control_request subtype 全表](#control_request-subtype-全表)） | 否 | 是 | 是 |
| `control_response` | 对 CLI 发起 `control_request{can_use_tool}` 的响应（权限 allow / deny 等） | 否 | 是 | 是 |
| `keep_alive` | 保活心跳 | 否 | 是 | 是 |
| `update_environment_variables` | 运行时更新环境变量 | 否 | 是 | 是 |

### JSONL 独有顶层类型

以下类型**不出现在 CLI stdout**，仅写入磁盘 JSONL 文件。它们的 `type` 是顶层字段，**不是** `system` 子类型。

| 类型 | 含义 | 关键字段 | Resume 恢复价值 |
|---|---|---|---|
| `attachment` | 运行时附件（MCP 指令、skill 列表、模式变更等 15+ 子类型） | `attachment.type`, `attachment.*` | **核心** — 可重建 MCP servers、skills、plan/auto 模式状态 |
| `last-prompt` | 上次用户 prompt 文本 | `lastPrompt`, `leafUuid` | **高** — 可用作 UI 输入回显或 draft 恢复 |
| `ai-title` | 会话活动/话题的描述性标题（**做什么事**，自由文本） | `aiTitle` | 中 — 会话列表摘要 |
| `agent-name` | 当前运行 agent/workflow 的身份标识（**我是谁**，slug；纯状态） | `agentName` | 低 — 识别活跃 agent 身份 |
| `user.permissionMode` | `type: "user"` 消息顶层的 permission mode 快照字段 | `permissionMode` | 中 — 恢复每个 turn 的 permission mode 上下文（153 条样本，比独立 `permission-mode` 更可靠） |
| `permission-mode` | 权限模式变更独立事件（非每条 user 消息都有） | `permissionMode` | 中 — 恢复 permission mode 显示（仅 7 条样本，不如 `user.permissionMode` 可靠） |
| `mode` | CLI 运行时心跳（永远 `"normal"`，非 permission mode 信号） | `mode` | **无** — 永远是 `"normal"`，不承载状态 |
| `file-history-snapshot` | 文件追踪系统快照 | `messageId`, `snapshot`, `isSnapshotUpdate` | 低 — 恢复文件编辑历史 |
| `queue-operation` | CLI 输入队列操作（入队/出队/移除/清空），`content` 为入队内容 | `operation`, `content?`, `timestamp`, `sessionId` | 低 — 调试输入管道 |
| `custom-title` | 用户自定义标题 | `customTitle` | 低 — 会话重命名记录 |

### 顶层辅助字段

这些字段不是独立消息类型，但在协议里同样需要明确含义。

| 字段                                | 含义                          | 用途                                     |
| ----------------------------------- | ----------------------------- | ---------------------------------------- |
| `uuid`                              | 消息唯一标识 + **持久化分类标记** | replay / reconnect 的尾部补齐依据。**有 `uuid` 的消息是对话树的持久节点（写入 JSONL）；无 `uuid` 的消息是瞬时信号（仅 stdout，不写入 JSONL）。已知例外：`mode`（无 `uuid` 但写入 JSONL）、`system.init` 与 `result`（有 `uuid` 但不写入 JSONL）。** |
| `session_id`                        | Claude CLI session UUID       | 会话与历史归属                           |
| `toolUseResult` / `tool_use_result` | 结构化工具结果                | Task / AskUserQuestion / tool 回填       |
| `sourceToolUseID`                   | skill body 关联的 tool_use id | 将 hidden skill content 附着到 tool-call |
| `parent_tool_use_id`                | 父 tool_use 关联              | 工具链路追踪                             |
| `isMeta`                            | CLI 内部隐藏消息              | skill body、系统内部用户形消息           |
| `isSynthetic`                       | 合成/内部消息标记             | 识别内部生成的 assistant / user 形消息   |

## 完整消息类型规范

每种消息以统一格式记录：**含义** → **字段** → **处理方法**。

### CLI → 客户端（stdout）

---

#### `system` / `init` — 会话初始化

**含义**：CLI 启动后发送的会话元数据。**只在第一条用户消息到达后发送**——CLI 启动时因等待 stdin 输入，不会立即发送 system.init。

**字段**：

| 字段                  | 类型       | 说明                                                                                                 |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `type`                | `"system"` | 消息类型                                                                                             |
| `subtype`             | `"init"`   | 初始化为 `"init"`                                                                                    |
| `uuid`                | string     | 消息唯一标识（实时 stdout 观测确认存在；但 `system.init` **不写入 JSONL**，是 `uuid` 持久化规则的已知例外） |
| `session_id`          | string     | CLI 内部 session UUID                                                                                |
| `model`               | string     | 当前运行的实际模型（如 `"claude-sonnet-4-6[1m]"`）                                                   |
| `permissionMode`      | string     | 当前权限模式（`"auto"`, `"default"`, `"bypassPermissions"`, `"acceptEdits"`, `"dontAsk"`, `"plan"`） |
| `cwd`                 | string     | CLI 工作目录                                                                                         |
| `tools`               | string[]   | 可用工具列表                                                                                         |
| `slash_commands`      | string[]   | 可用 slash 命令                                                                                      |
| `mcp_servers`         | object[]   | MCP 服务器列表                                                                                       |
| `agents`              | string[]   | 可用 subagent 类型                                                                                   |
| `skills`              | string[]   | 可用 skill 列表                                                                                      |
| `plugins`             | string[]   | 可用 plugin 列表                                                                                     |
| `apiKeySource`        | string     | API key 来源（`"none"` 表示外部配置）                                                                |
| `claude_code_version` | string     | CLI 版本号                                                                                           |
| `output_style`        | string     | 输出样式（`"default"`）                                                                              |

**处理方法**：

1. 解析 `model` 和 `permissionMode`，更新客户端 UI 状态（模型下拉框选中项、权限模式指示器）
2. 派生 model tier（从完整 model 名中提取，如 `"claude-sonnet-4-6[1m]"` → `"sonnet"`）
3. 存储 `session_id` 用于后续 CLI 进程管理
4. system.init 是 model 和 permissionMode 的**权威来源**——新 session、重连、切换后均以 system.init 中的值为准

**时效性**：

| 场景                                                  | model 来源                             | permissionMode 来源                       |
| ----------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| 新 session（用户尚未发消息）                          | `--model` 显式传入，或 CLI 默认        | `--permission-mode` 显式传入，或 CLI 默认 |
| `--resume` 恢复 session                               | CLI JSONL 文件中的上次值 → system.init | CLI JSONL 文件中的上次值 → system.init    |
| 切换 model（`--model X --resume`）                    | 新传入值 `X`                           | CLI JSONL 文件中的值                      |
| 切换 permissionMode（`--permission-mode Y --resume`） | CLI JSONL 文件中的值                   | 新传入值 `Y`                              |

关键结论：新 session 必须在创建时显式传入 `--model` 和 `--permission-mode`（参考 hapi 的 `bootstrapSession` 方案），因为 system.init 在用户发消息前不可用。对于恢复/重连，system.init 是权威来源。两个值同时存入服务端 metadata 以便 REST API 在 system.init 到达前返回初始值。

---

#### `system` / `status` — 状态变更（权限模式 / compact）

**含义**：CLI 的状态变更通知，有两种互斥变体，靠 `status` 与 `permissionMode` 字段区分：

- **权限模式切换**：`status: null` + 携带 `permissionMode`。在权限模式发生变化（ExitPlanMode 同意、`/permissions` slash、`setMode` permission_update）时发送。权威来源：`SDKStatusMessageSchema`，触发条件是 `toolPermissionContext.mode` 变化。
- **compact 生命周期**：`status: "compacting"`（压缩进行中）或携带 `compact_result`（压缩完成）。

**字段**：

| 字段             | 类型                                     | 说明                                          |
| ---------------- | ---------------------------------------- | --------------------------------------------- |
| `type`           | `"system"`                               | 消息类型                                      |
| `subtype`        | `"status"`                               | 状态通知                                      |
| `status`         | `"compacting"` \| `null`                 | compact 进行中 / 其他（模式切换时为 `null`）  |
| `permissionMode` | `PermissionMode`?                        | 模式切换时的新权限模式（compact 变体不带）    |
| `compact_result` | `"success"` \| `"failed"`?               | compact 结果（完成时）                        |
| `compact_error`  | string?                                  | compact 失败原因（失败时）                    |
| `session_id`     | string                                   | 会话 UUID                                     |

```json
// 权限模式切换（同意计划 → 进入 auto）
{ "type": "system", "subtype": "status", "status": null, "permissionMode": "auto", "uuid": "...", "session_id": "..." }

// compact 开始
{ "type": "system", "subtype": "status", "status": "compacting", "session_id": "..." }

// compact 完成
{ "type": "system", "subtype": "status", "status": null, "compact_result": "success", "session_id": "..." }
```

**处理方法**：

1. **权限模式切换**（`permissionMode` 存在）→ 更新会话 `permissionMode` 标量状态（刷新权限模式 chip），并在流中渲染一条内联「已切换到 {{mode}}」提示（`systemMessageType: "mode-change"`）。与 `permission-mode` 消息、attachment `auto_mode`/`plan_mode` 的 `setPermissionMode` 冗余但幂等。
2. `status: "compacting"` → 设置 `isRunning = true`，显示 compact 进度指示器
3. `compact_result: "success"` → 隐藏进度指示器，进入 replay 阶段
4. `compact_result: "failed"` → 显示失败信息，`compact_error` 说明原因
5. compact 变体需配合 `compact_boundary` 消息实现完整的 compact 阶段跟踪（见下方生命周期章节）

> 渲染区分（参考下文渲染表）：**权限模式切换变体渲染为内联提示 + 更新 permissionMode**；**compact 变体不渲染**（由 `CompactIndicator` 独立驱动，见 `Claude2SessionDetailRoute.tsx`）。

---

#### `system` / `compact_boundary` / `microcompact_boundary` — 上下文压缩标记

**含义**：CLI 持久化到 JSONL 的压缩记录（`isMeta: false`，`content: "Conversation compacted"`）。表示在此之前的上下文已被压缩，后续消息在一个精简后的上下文中继续。每个 `compact_boundary` **紧跟一条 `isCompactSummary: true` 的 `user` 消息**（压缩后的 summary 正文），二者 1:1 相邻——跨 4 个真实会话（7–55 次 compact）核实 `compactMetadata` 条数与 `isCompactSummary` 条数严格相等。

**字段**（compact_boundary 外层信封）：

| 字段                                       | 类型                                              | 说明                                                                                        |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `type`                                     | `"system"`                                        | 消息类型                                                                                    |
| `subtype`                                  | `"compact_boundary"` \| `"microcompact_boundary"` | 压缩类型                                                                                    |
| `content`                                  | `"Conversation compacted"`                        | 固定文案                                                                                    |
| `parentUuid`                               | `null`                                            | **恒为 null**——compact 点故意断开物理父子链（见下方 parentUuid/logicalParentUuid 语义）    |
| `logicalParentUuid`                        | string?                                           | = `compactMetadata.preservedSegment.tailUuid`（"若没 compact 该挂哪"的跨边界桥），仅新版有  |
| `compactMetadata` / `microcompactMetadata` | object                                            | 压缩元数据，schema 新老版本不同（见下）                                                     |

**`compactMetadata` schema（新老 CLI 版本不同）**：

| 字段                | 旧版（2026-05 样本） | 新版（2026-06 样本） | 说明                                          |
| ------------------- | -------------------- | -------------------- | --------------------------------------------- |
| `trigger`           | ✅                   | ✅                   | `"auto"` \| `"manual"`（长会话 auto 主导）    |
| `preTokens`         | ✅                   | ✅                   | 压缩前 token 数                               |
| `postTokens`        | ✅                   | ✅                   | 压缩后 token 数（≈ CLI 活跃上下文大小）       |
| `durationMs`        | ✅                   | ✅                   | 压缩耗时                                      |
| `preservedSegment`  | ❌                   | ✅                   | `{headUuid, anchorUuid, tailUuid}`——保留段   |
| `preservedMessages` | ❌                   | ✅                   | `{anchorUuid, uuids[], allUuids[]}`——保留 uuid |

**跨版本稳定信号**：`subtype === "compact_boundary"`（+ 紧跟的 `isCompactSummary: true`）在所有版本一致；`preservedSegment`/`preservedMessages` 仅新版有，**不能**作为检测依据。

**伴随 summary 消息**（`isCompactSummary`）：紧跟 compact_boundary 的 `type: "user"` 消息，不是用户输入：

| 字段                                | 说明                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `isCompactSummary`                  | `true`——标记压缩 summary                                                  |
| `message.content`                   | string——summary 正文（"This session is being continued from a previous…"） |
| `summarizeMetadata.messagesSummarized` | number?——被总结的消息数（可缺失，client 防御性读取）                    |
| `parentUuid`                        | = 前导 compact_boundary 的 uuid（summary 挂在 boundary 上）                |
| `uuid`                              | = `compactMetadata.preservedSegment.anchorUuid`                            |

```json
// 新版 schema（f4dd7cbe 会话实测）
{
  "type": "system",
  "subtype": "compact_boundary",
  "content": "Conversation compacted",
  "parentUuid": null,
  "logicalParentUuid": "4e6c0d93-6e2e-4e4e-902b-3d0c2d8a7161",
  "compactMetadata": {
    "trigger": "auto",
    "preTokens": 227286,
    "postTokens": 10826,
    "durationMs": 187851,
    "preservedSegment": {
      "headUuid": "882c6101-1fc2-472b-b857-5c1962c4fe47",
      "anchorUuid": "3a6c8d5f-72e8-4fef-9232-d505a1b9f728",
      "tailUuid": "4e6c0d93-6e2e-4e4e-902b-3d0c2d8a7161"
    },
    "preservedMessages": { "anchorUuid": "3a6c8d5f-...", "uuids": ["882c6101-...", "..."], "allUuids": ["..."] }
  }
}
```

**`parentUuid` / `logicalParentUuid` 语义**（CLI 源码核实：ChinaSiro/claude-code-sourcemap，经 deepwiki）：

- `parentUuid` = **物理**父子；CLI 的 `buildConversationChain`（`sessionStorage.ts`）沿它倒序重建对话链。
- `compact_boundary` 的 `parentUuid = null` 是**故意**断链——物理链在 compact 点终止。
- `logicalParentUuid` = "如果没 compact 该挂哪"，由 `createCompactBoundaryMessage`（`messages.ts`）设为 `lastPreCompactMessageUuid`（= `preservedSegment.tailUuid`）。它是跨 compact 边界的概念桥，**主链重建不走它**。
- 真正的跨 compact 修复是 load 时的 `applyPreservedSegmentRelinks`（`sessionStorage.ts`）：用 `preservedSegment` 改写 preserved 消息的 `parentUuid`（headUuid→anchorUuid、anchorUuid 的其它子→tailUuid），把 preserved 段重新接回主链。**注意**：磁盘 JSONL 里 preserved 段的 `parentUuid` 是 pre-relink 原值，relink 只发生在 CLI 内存。

**对本项目的影响**：agents-remote client 渲染靠有序 `rawMessages` + `tool_use_id` 匹配，**不 walk parentUuid 树**，因此 `compact_boundary` 的 `parentUuid:null` 不会断开渲染；`parentUuid`/`logicalParentUuid` 仅用于 error/synthetic 挂气泡（`getMsgParentUuid`：`parentUuid ?? logicalParentUuid ?? null`，已 fallback）。所以把 `compact_boundary` 当纯位置标记即可，无需复制 CLI 的 `applyPreservedSegmentRelinks`。日后若真要建 uuid 图，跨 compact 边界走 `logicalParentUuid` 不要走 `parentUuid`。compact-block windowing 的设计应用见 [message-replay 设计](../design/message-replay.md)。

**处理方法**：

1. 将当前正在积累的 assistant bubble 刷出
2. 以 `role: "system"` 在消息流中渲染压缩分割线，显示压缩类型（手动/自动）和压缩前 token 数（`compactMetadata.preTokens`）
3. 手动压缩显示「上下文已压缩 (~120k tokens)」，自动压缩显示「上下文自动压缩 (~120k tokens)」
4. **compact-window absorption**：compact_boundary 后开一个"compact 窗口"，把紧跟的 `isCompactSummary` summary 消息、窗口内的 `attachment`、以及 isMeta/isSynthetic 噪声（`<local-command-stdout>Compacted</local-command-stdout>` 等）一起吸收成**单个 compact-block**（`compact-block.tsx`），不作为独立用户气泡；窗口在下一条真实内容消息处关闭。`isCompactSummary` 检查在 `isMeta` 之前（summary 可能同时带 isMeta，不能丢）
5. 这是持久化消息——重连时也会重放

---

#### `system` / `api_retry` — API 请求重试

**含义**：CLI 向 Anthropic API 发送请求失败（如 502/overloaded）后自动重试的通知。只在发生重试时发送，不表示重试最终成功或失败。

**字段**：

| 字段             | 类型          | 说明                              |
| ---------------- | ------------- | --------------------------------- |
| `type`           | `"system"`    | 消息类型                          |
| `subtype`        | `"api_retry"` | 重试通知                          |
| `attempt`        | number        | 当前第几次重试                    |
| `max_retries`    | number        | 最大重试次数                      |
| `retry_delay_ms` | number        | 距下次重试的等待时间（毫秒）      |
| `error`          | string?       | 失败原因描述（如 `"Overloaded"`） |
| `error_status`   | number?       | HTTP 状态码（如 502）             |
| `session_id`     | string        | 会话 UUID                         |

```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 2,
  "max_retries": 3,
  "retry_delay_ms": 2000,
  "error": "Overloaded",
  "error_status": 502,
  "session_id": "..."
}
```

**处理方法**：

1. **合并为一条瞬时重试状态**（`RetryIndicator`），而非逐条 inline——网络波动常连续多条 api_retry（attempt 1→max），逐条 inline 会刷屏。Pass-1 `applyMessageScalarState` 收到每条 api_retry 时更新同一个 `retryInfo` 标量（`attempt` / `maxRetries` / `retryDelayMs` / `error` / `errorStatus`），渲染为输入区附近的 spinner 胶囊（`attempt/max · error · Xs 后`），随每条更新、倒计时到 0 或 `result` 到达自动消失
2. 文案由 i18n `claude2.retry.bannerMulti`（`{attempt}/{max}`）/ `bannerSingle` 拼装
3. **不产生聊天气泡**：Pass-2 `normalizeChatStream` 对 api_retry `continue`（不落 fallback、不出 inline error）
4. 不表示最终失败——最终失败由 `result` 的 `is_error: true` 表达为终态 error divider；重试成功则后续 assistant 自然覆盖，`retryInfo` 由倒计时或 `result` 清空

---

#### `system` / `api_error` — API 错误通知

**含义**：CLI 在 API 请求或内部处理出错时发送的系统级错误通知。同时出现在 CLI stdout 和 JSONL 中。

**字段**（从实机 JSONL 提取）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"system"` | 消息类型 |
| `subtype` | `"api_error"` | 错误通知 |
| `level` | `"error"` | 日志级别 |
| `error` | object | 错误详情：`{ message, formatted, connection?, isNetworkDown, rateLimits? }` |
| `error.message` | string | 简短错误描述（如 `"Connection error."`） |
| `error.formatted` | string | 格式化错误信息（如 `"Unable to connect to API (ECONNRESET)"`） |
| `error.connection` | object? | 连接级错误详情（`{ code, message, isSSLError }`） |
| `error.isNetworkDown` | boolean | 网络是否断开 |
| `retryInMs` | number | 重试等待时间（毫秒） |
| `retryAttempt` | number | 当前重试次数 |
| `maxRetries` | number | 最大重试次数 |
| `session_id` | string | 会话 UUID |

**处理方法**：

1. 当作 inline 错误消息处理，而不是普通聊天气泡
2. 若存在 `error_status`，优先展示状态码；若存在 `error`，展示人类可读原因
3. 它属于运行时错误路径，不是稳定历史内容的一部分，但在重连/回放中如果出现，应按系统错误渲染

---

#### `attachment` — JSONL 独有顶层类型：运行时附件注册

**注意**：`attachment` 是**顶层类型**（`type: "attachment"`），不是 `system` 子类型。**仅出现在 JSONL 磁盘文件中**，CLI stdout 不输出。

**含义**：记录 CLI 运行时的非对话状态变更——MCP 指令、skill 列表、模式切换、文件编辑、hook 执行等。每条 attachment 都是对某个状态的增量更新。

**字段**（外层信封）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"attachment"` | 顶层消息类型 |
| `attachment.type` | string | 子类型（15+ 种，见下方） |
| `attachment.*` | — | 其他字段随子类型变化 |
| `uuid` | string | 消息唯一标识 |
| `parentUuid` | string \| null | 父消息 UUID |
| `isSidechain` | boolean | 是否为侧链消息 |
| `timestamp` | string (ISO 8601) | 产生时间 |
| `sessionId` | string | 会话 UUID |
| `cwd` | string | 工作目录 |
| `gitBranch` | string | 当前 Git 分支 |

**处理方法**：

1. 不渲染到聊天流——它记录运行时状态变更
2. 可用于 Resume 恢复 MCP servers、skills、plan/auto mode 状态

---

#### `last-prompt` — JSONL 独有顶层类型：上次用户 Prompt

**注意**：`last-prompt` 是**顶层类型**（`type: "last-prompt"`，注意有连字符），**不是** `system` 子类型。**仅出现在 JSONL 磁盘文件中**，CLI stdout 不输出。

**含义**：CLI 的会话持久化游标——由 `insertMessageChain` 在每次消息链写入 JSONL 时同步更新，标记会话树的当前位置。**仅写入 JSONL，CLI stdout 不输出**。Resume 时 CLI 通过 `findLast` 读取最后一条 `last-prompt` 恢复 `currentSessionLeafUuid` 和 `currentSessionLastPrompt`。

**字段**（从实机 JSONL 提取，f4dd7cbe session 中 307 条样本）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"last-prompt"` | 顶层消息类型 |
| `lastPrompt` | string | 当前最新用户文本输入（截断至 200 字符），多次重复直至用户输入新内容 |
| `leafUuid` | string | 会话树当前叶节点的 UUID——最近一个有意义的非传输类消息（`assistant` 或 `user`），跳过 `file-history-snapshot`、`permission-mode` 等 |
| `sessionId` | string | 会话 UUID |

**出现规律**：

- 与 `insertMessageChain` 同步触发，非"每轮开始"。每条新消息写入 JSONL 后都可能触发新的 `last-prompt`
- 如果用户未输入新文本（如工具执行轮次），同一 `lastPrompt` 会反复出现。f4dd7cbe 中 "继续" 出现 41 次，"那么先push" 出现 42 次，均分布在多个内部轮次间
- `leafUuid` 在 281/307（91.5%）中匹配紧邻前一条消息的 `uuid`；26 个不匹配中，`leafUuid` 指向更早的消息，跳过了传输类条目

**处理方法**：

1. 不渲染到聊天流——它是会话游标，而非对话内容
2. 可用于恢复输入框 draft 或显示"上次对话"摘要（取最后一次出现者的 `lastPrompt`）
3. `leafUuid` 标记了会话树的结束位置，resume 时新消息以此作为 `parentUuid`

---

#### `mode` — CLI 运行时心跳（非 permission mode 信号）

**含义**：CLI 内部运行时心跳。从 111 条真实 `type: "mode"` 消息（11/53 session 文件）统计，`mode` 字段**永远为 `"normal"`**。它不是 permission mode 变更信号 — permission mode 的权威来源是 `system.init.permissionMode`（启动时）和 `permissionMode` 字段（写在 `type: "user"` 消息上，记录每次用户输入时的权限模式）。

**出现规律**：仅在 11/53 session 中出现，且分布极不均匀 — 一个 session（`db0970f6`）独占 75/111 条。通常出现在 turn 边界。

**字段**：

| 字段         | 类型       | 说明                                           |
| ------------ | ---------- | ---------------------------------------------- |
| `type`       | `"mode"`   | 顶层消息类型                                   |
| `mode`       | `"normal"` | **永远为 `"normal"`**（111/111 验证）          |
| `session_id` | string     | 会话 UUID                                      |

**示例**（CLI stdout 与 JSONL 格式一致）：

```json
{ "type": "mode", "mode": "normal", "session_id": "e3ca9671-..." }
```

**处理方法**：

1. 过滤 — 不作为聊天消息渲染
2. 不用于 permission mode 状态更新（使用 `system.init.permissionMode` 和 `user.permissionMode`）

---

**含义**：CLI 终端 TUI 渲染过程中产生的 per-chunk 推理 token 增量计数。这不是 Claude 返回的 thinking 内容——真正的 thinking 嵌入在 assistant 消息的 `content` 数组内（`type: "thinking"`）。

**字段**：

| 字段                     | 类型                | 说明                  |
| ------------------------ | ------------------- | --------------------- |
| `type`                   | `"system"`          | 消息类型              |
| `subtype`                | `"thinking_tokens"` | 推理 token 计数       |
| `estimated_tokens`       | number              | 当前累计推理 token 数 |
| `estimated_tokens_delta` | number              | 本增量段的 token 数   |
| `session_id`             | string              | 会话 UUID             |

```json
{
  "type": "system",
  "subtype": "thinking_tokens",
  "estimated_tokens": 15000,
  "estimated_tokens_delta": 500,
  "session_id": "..."
}
```

**处理方法**：

1. **不单独渲染为聊天气泡**——`thinking_tokens` 不是独立消息卡片，但它对 Web UI **有意义**
2. 在实时流中：
   - 通过 `broadcast` 原样推送给客户端，更新当前 turn 共享的 `turnTokens` ref
   - 驱动 Thinking 面板上的实时 token 计数（如 `Thinking… (39 tokens)`）
3. **合并语义**（一条 turn 内 `thinking_tokens` 与 `assistant` 的关系）：
   - 一个 turn 内，`thinking_tokens`（可能多次，`estimated_tokens` 递增）先于 `assistant(thinking)` 到达
   - 后续的 `assistant` 消息携带 `message.content[x].type = "thinking"`（真正的推理文本），**不**带 `userType` 字段
   - `thinking_tokens` **不**产生独立 UI 气泡；`assistant(thinking)` 产生一个带 reasoning part 的 assistant 气泡
   - `thinking_tokens` 的最终 `estimated_tokens` 值 stamp 到该 assistant 气泡的 `message.metadata.custom.estimatedTokens`（**消息级别**，不是 part 级别——assistant-ui 的 `ReasoningMessagePart` 不支持自定义 metadata）
   - 实时流中 `turnTokens` ref 在收到 `result` 时清零，确保下个 turn 不残留旧值
4. 在 relay buffer / 历史回放中：
   - 连续的 `thinking_tokens` 折叠为最后一条
   - 回放时不展示中间动画，但最终 token 总数仍要 attach 到 reasoning part
5. 真正的 thinking 文本内容仍然来自 assistant `content` 中的 `{ type: "thinking", thinking: "...", signature: "..." }`
6. `thinking_tokens` 本身不生成新的 UI part；它只是为同 turn 的 reasoning part 提供 token metadata

---

### 消息树：主对话与侧链

Claude CLI 会话中，主 agent 可以通过 `TaskCreate` 或 Workflow 创建子 agent。这些子 agent 拥有自己的独立对话循环，其消息在 JSONL 中形成**侧链（sidechain）**——以主对话为干、子 agent 对话为枝的消息树。

**层级结构示意**：

```
主对话（isSidechain: false）：
  user:    "帮我找所有 API 端点"                    ← 用户原始输入
  assistant: 调用 TaskCreate → 创建子 agent          ← 产生 tool_use
      │
      │  parentUuid 指向这个 tool_use
      ▼
侧链（isSidechain: true, userType: "external"）：
  user:       "Find all API endpoints in this codebase"  ← 子 agent 收到的 prompt
  assistant:  "Found 12 endpoints in 3 files"            ← 子 agent 的回复
  user:       tool_result (e.g. grep output)              ← 子 agent 使用工具
  result:     "endpoint list compiled"                    ← 子 agent 任务结束

主对话继续：
  assistant: "好的，找到了 12 个端点..."              ← 拿到子 agent 结果后继续主对话
```

**关键字段**：

| 字段 | 位置 | 含义 |
|---|---|---|
| `parentUuid` | JSONL 信封 | 父消息 UUID，侧链消息通过它挂回主链上创建子 agent 的那条 tool_use |
| `isSidechain` | JSONL 信封 | `true` 时表示该消息属于子 agent 对话，不在主对话链上 |
| `userType` | JSONL 信封 | `"external"` 来自主进程外部（用户输入、子 agent 输出），`"synthetic"` 来自 CLI 内部生成 |

**为什么需要侧链**：
- 子 agent 的对话是独立的 conversation loop，不和主对话的消息混排在同一个时间线上
- JSONL 通过 `parentUuid` / `isSidechain` 保留树状层级，resume 时可重建完整上下文
- UI 呈现上，侧链消息通常折叠在 task 卡片内，而不是平铺在主聊天流中

**Agent/Task 工具的 sidechain 落盘（实机观测 2026-06-20）**：

经 Agent/Task 工具（`subagent_type: "Plan"`/`"Explore"` 等）创建的子 agent，其 sidechain 消息**不内联在主会话 JSONL**，而是落到会话目录下的独立文件（上文的 `parentUuid`/`isSidechain` 内联树结构不适用于这类工具）：

| 文件 | 内容 |
|---|---|
| `subagents/<agentId>.jsonl` | 子 agent 完整对话（thinking/text/tool_use/tool_result，全 `isSidechain:true` + `agentId`），例如 Plan 子 agent 的设计产出 |
| `subagents/<agentId>.meta.json` | `{ agentType, description, toolUseId }`，通过 `toolUseId` 关联到主会话里创建它的那条 Agent tool_use |

主会话 JSONL 在这类工具调用处只保留 head（Agent tool_use）+ tail（tool_result envelope，含 `toolUseResult` 状态摘要），整条主 JSONL 里 `parent_tool_use_id` / `isSidechain:true` / `task_progress` 计数为 0。

**body 数据在 live 与 resume 两条路径上来源不同**：

| 路径 | body 数据来源 | 关联键 |
|---|---|---|
| live（CLI stdout 流） | 子 agent 的中间消息（thinking/text/tool_use）**内联**出现在主流里 | `parent_tool_use_id` 指向 head 的 tool_use；另有 `task_progress` 推送聚合统计（tokens/tool_uses/duration，不产生独立渲染条目） |
| resume（JSONL） | 主 JSONL **不含** body；真实 body 在 `subagents/<agentId>.jsonl` | `subagents/<agentId>.meta.json` 的 `toolUseId` |

因此前端 Agent 容器（head-body-tail）的 body 渲染：live 路径已通过 `parent_tool_use_id` 关联实现；resume 路径要恢复 body 必须后端额外读取 `subagents/*.meta.json` + `.jsonl` 并注入主流（后续任务）。

---

#### `system` / `task_started` — 子任务创建

**含义**：当 Claude 通过 TaskCreate 或 Workflow 创建子任务/子 agent 时发送。标记一个子任务的开始。

**字段**（从 CLI binary 提取，待实机验证）：

| 字段           | 类型             | 说明                                                 |
| -------------- | ---------------- | ---------------------------------------------------- |
| `type`         | `"system"`       | 消息类型                                             |
| `subtype`      | `"task_started"` | 子任务开始                                           |
| `task_id`      | string           | 子任务唯一标识                                       |
| `agentType`    | string           | 子 agent 类型（如 `"general-purpose"`, `"Explore"`） |
| `workflowName` | string?          | 关联的 workflow 名称                                 |
| `prompt`       | string           | 子任务的 prompt                                      |

**处理方法**：

1. 将子任务加入 client 端 task 列表（显示在输入框上方）
2. 记录与父 tool_use 的关联（通过 tool_use_id 或 workflow）
3. 这是**运行时辅助状态**。当前它依赖 stream/replay batch 中的 `task_*` 消息恢复；Claude CLI JSONL 本身不持久化这些记录，因此刷新后的历史回放可能不含 task 条目
4. `system.task_*` 是顶部 task 列表的**权威 telemetry 来源**。实现中 `extractTaskOps` 也从 `TaskCreate`/`TaskUpdate` **工具调用**维护同一 task 列表（作为 telemetry 的补充），此时真实 id 必须从 tool_result 的 `toolUseResult.task.id` 回填（见下文「`tool_use_result` / `toolUseResult`」章节的「真实 id 来源」），不能用 tool_use 阶段缺省的 id

---

#### `system` / `task_updated` — 子任务状态变更

**含义**：子任务的状态发生变化（完成、后台化、出错等）。

**字段**（从 CLI binary 提取，待实机验证）：

| 字段              | 类型             | 说明             |
| ----------------- | ---------------- | ---------------- |
| `type`            | `"system"`       | 消息类型         |
| `subtype`         | `"task_updated"` | 子任务状态变更   |
| `task_id`         | string           | 子任务唯一标识   |
| `isBackgrounded`  | boolean?         | 是否转入后台     |
| `error`           | string?          | 错误信息         |
| `end_time`        | number?          | 结束时间戳       |
| `total_paused_ms` | number?          | 总暂停时长（ms） |

**处理方法**：

1. 更新 client 端 task 列表中对应 task 的状态
2. 出错时显示错误标记
3. 后台化时更新 UI 状态
4. 同 `task_started`，它属于**运行时辅助状态**，当前不依赖 JSONL 持久化

---

#### `system` / `task_notification` — 子任务通知

**含义**：子任务产生阶段性输出或完成通知。包括完成消息、进度更新等。

**字段**（从 CLI binary 提取，待实机验证）：

| 字段             | 类型                  | 说明                                        |
| ---------------- | --------------------- | ------------------------------------------- |
| `type`           | `"system"`            | 消息类型                                    |
| `subtype`        | `"task_notification"` | 子任务通知                                  |
| `task_id`        | string                | 子任务唯一标识                              |
| `text`           | string                | 通知文本（如 "Agent completed · 3h 2m 5s"） |
| `summary`        | string?               | 任务摘要（可用于更新任务描述）              |
| `outputFile`     | string?               | 子任务输出文件路径                          |
| `skipTranscript` | boolean?              | 是否跳过 transcript 记录                    |

**处理方法**：

1. 更新 task 列表中对应该 task 的状态和输出
2. 在输入框上方的 task 列表常驻显示
3. 无需在聊天流中额外渲染气泡
4. 同 `task_started` / `task_updated`，它属于**运行时辅助状态**，当前不依赖 JSONL 持久化

---

#### `system` / `task_progress` — 子 agent 运行进度

**含义**：当一个 AgentTool 调用的子 agent（如 `subagent_type: "Plan"`）在后台运行时，CLI 通过 `task_progress` 推送实时累计统计。这些消息**不产生独立渲染条目**，而是挂载到对应 `tool_use_id` 的 AgentTool 卡片内部，作为进度行展示。`useRemoteSession` 显式跳过此类型（return early）——它只给 bridge 对端（web 控制面）消费。

**字段**（实机观测 + SDK schema）：

| 字段              | 类型                          | 说明                                             |
| ----------------- | ----------------------------- | ------------------------------------------------ |
| `type`            | `"system"`                    | 消息类型                                          |
| `subtype`         | `"task_progress"`             | 子类型                                            |
| `task_id`         | string                        | 子任务 ID                                         |
| `tool_use_id`     | string (optional)             | 关联的 AgentTool tool_use ID                      |
| `description`     | string                        | 当前活动描述（如 "Design novel-writing SaaS…"）     |
| `subagent_type`   | string (optional)             | 子 agent 类型名（如 `"Plan"`, `"Explore"`）        |
| `usage`           | object                        | 累计用量统计                                      |
| `usage.total_tokens` | number                     | 累计 token 消耗                                    |
| `usage.tool_uses` | number                        | 累计工具调用次数                                   |
| `usage.duration_ms` | number                      | 累计运行耗时（毫秒）                               |
| `last_tool_name`  | string (optional)             | 最近一次工具调用的工具名                           |
| `summary`         | string (optional)             | 进度摘要                                          |
| `uuid`            | string                        | 消息 UUID                                          |
| `session_id`      | string                        | 会话 ID                                            |

**示例**：

```json
{
  "type": "system",
  "subtype": "task_progress",
  "task_id": "a3a045713fd221a6c",
  "tool_use_id": "call_00_kLrrbWf6MFxlEKc6CpOh2474",
  "description": "Design novel-writing SaaS architecture",
  "subagent_type": "Plan",
  "usage": { "total_tokens": 17, "tool_uses": 10, "duration_ms": 27339 },
  "last_tool_name": "mcp__context7__resolve-library-id",
  "uuid": "9e2ab646-49b1-4f97-90db-fb9bfc7438d3",
  "session_id": "330dc156-7ffb-4c09-a6f1-aeb7136636c4"
}
```

**处理规则**：

1. 在 `normalizeChatStream` 中通过 `tool_use_id` 匹配已存在的 tool-call part（先查 buffer，再查已 emitted items），将 progress 数据注入 part 的 `progress` 字段
2. `renderChatStream` 将 `progress` 传入 tool-card 的 `metadata.custom`
3. SystemChatBubble tool-card 检测到 `progress` 时，在工具卡片内部渲染进度行：subagent_type 标签 + description + 用量统计
4. 该消息**不产生独立 ChatStreamItem**（类似 `tool_result` 的关联模式，但注入的是进度而非结果）

**与 `task_started` / `task_updated` / `task_notification` 的区别**：

| 维度         | task_started/updated/notification              | task_progress                                      |
| ------------ | ---------------------------------------------- | -------------------------------------------------- |
| 消费方       | web 控制面 TaskPanel                            | Agent tool-card 内部渲染                            |
| 关联方式     | 独立 task_id（TaskInfo 列表）                   | tool_use_id → 匹配 tool-call part                   |
| 数据内容     | 状态变更（running/completed/error）             | 累计统计快照（tokens, tool_uses, duration）          |
| 消息通道     | stdout → normalize 统一处理                     | stdout → normalize 注入 part，不产生独立 item         |
| UI 表现      | 底部 TaskPanel 条目                             | tool-card 内部进度行 "Plan · Design… · 10 tools · 17K tokens · 27s" |

---

#### `system` / `permission_denied` — 自动权限拒绝

**含义**：Auto mode classifier 或权限系统拒绝某个工具调用时发送。它是一个**运行时控制信号**，不是聊天主线消息。

**字段**（按实机日志总结）：

| 字段                   | 类型                  | 说明                              |
| ---------------------- | --------------------- | --------------------------------- |
| `type`                 | `"system"`            | 消息类型                          |
| `subtype`              | `"permission_denied"` | 权限拒绝                          |
| `tool_name`            | string                | 被拒绝的工具名（如 `"Bash"`）     |
| `tool_use_id`          | string                | 对应的 tool_use id                |
| `decision_reason_type` | string                | 拒绝原因类型（如 `"classifier"`） |
| `decision_reason`      | string                | 人类可读拒绝原因                  |

**处理方法**：

1. 通过 `tool_use_id` 匹配挂载到对应 tool-use 卡片，渲染为紫色（permission 角色色）拒绝 banner 显示 `decision_reason`；与后续 `user.tool_result(is_error=true)` 的红色错误结果**并存**于同一卡片（前者解释"为何被拒"，后者显示"结果内容"），二者色彩区分、不互相覆盖
2. 它可用于调试日志和协议理解：说明为什么某个 tool_call 最终得到错误结果
3. 它属于**实时流信号**，当前不会写入 Claude CLI JSONL 历史

---

**含义**：CLI 在调用 Skill 工具后，会将 skill 的 SKILL.md 全文以 `isMeta: true` 的 `user` 消息形式发送给模型。这条消息**不是用户输入**，不应渲染为用户气泡。

**字段**：

| 字段              | 类型                                          | 说明                                                          |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `type`            | `"user"`                                      | 消息类型（复用 user 通道）                                    |
| `isMeta`          | `true`                                        | **核心标记**——CLI 内部消息，不应展示为用户气泡                |
| `sourceToolUseID` | string                                        | 关联的 Skill `tool_use` 的 `id`，用于找回触发此内容的工具调用 |
| `message.content` | `[{ type: "text", text: "<SKILL.md 全文>" }]` | Skill 的完整说明文档                                          |

**示例**：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      { "type": "text", "text": "Base directory for this skill: /home/...\n\n# tavily search\n..." }
    ]
  },
  "isMeta": true,
  "sourceToolUseID": "call_00_PFnfPCLCTbmIGDB806B40775"
}
```

**处理方法**：

Skill 调用产生三条消息的序列，后两条关联同一个 `tool_use_id`：

```
1. assistant message.content:
     { type: "tool_use", id: "call_00_X", name: "Skill", input: {...} }
2. user message:
     { type: "user", message: { content: [
         { type: "tool_result", tool_use_id: "call_00_X", content: "Launching skill: xxx" }
       ] } }
     — 基本结果文本。可能有顶层 `toolUseResult` 字段提供结构化结果。
3. user message:
     { type: "user", isMeta: true, sourceToolUseID: "call_00_X",
       message: { content: [{ type: "text", text: "Base directory for this skill: ..." }] } }
     — SKILL.md 全文。isMeta 标记这是 CLI 内部语境，sourceToolUseID 关联回 Skill tool_use。
```

处理规则（`deriveThread`，实时流和回放统一，语义层处理差异）：
	
	1. 消息 1 的 `tool_use` → 创建 tool-call part（`toolCallId = block.id`）
	2. 消息 2 的 `tool_result` → 通过 `tool_use_id` 匹配 tool-call part，设置 `result` 字段；记录 `lastToolUseId` 供后续 skill body 关联（见下方 isSynthetic 实时流差异）
	3. 消息 3（`isMeta: true` + `sourceToolUseID`）→ 通过 `sourceToolUseID` 匹配 tool-call part，设置 `metadata.skillContent`；**跳过用户气泡渲染**（`continue`）
	4. 无 `sourceToolUseID` 的 `isMeta` 消息（如 "Continue from where you left off"）→ **仅跳过气泡**，不附加任何内容

**注意**：消息 2（tool_result）不触发 `flushAssistant()`——它的 content 只有 `tool_result` 块，无 `text` 块。因此消息 3 到达时 tool-call 仍在 `currentParts` 中，可以直接匹配。若 tool-call 已经因为后续 assistant 消息被 flush，`applyToolResultsToMessages` 会回溯更新先前渲染的 assistant bubble。

**relay 行为**：relay 不做任何过滤。`isMeta` 消息在 live broadcast 和 pending buffer/JSONL replay 两条路径上**完全一致**地传输。`isChatMessage` 不排斥 `isMeta`——rendering 决策统一在前端 `deriveThread` 中完成。

**实时流 isSynthetic vs JSONL isMeta 差异**：

| 方面 | 实时流（live stream） | JSONL / 历史回放 |
|------|----------------------|-------------------|
| 标记字段 | `isSynthetic: true` | `isMeta: true` |
| `sourceToolUseID` | ❌ 通常**没有**此字段 | ✅ 有此字段 |
| `parentUuid` | ❌ 通常**没有**此字段 | ✅ 有此字段 |
| 关联方式 | 有序日志中**前一条 tool_result** 的 `tool_use_id`（即 `lastToolUseId`） | 显式 `sourceToolUseID` 字段直接匹配 |
| 处理函数 | `deriveThread` 中 fallback 到 `lastToolUseId` | `deriveThread` 中优先使用 `sourceToolUseID` |

**实现细节**（`deriveThread` SkillBody 处理）：
- 优先使用 `sourceToolUseID`（JSONL 路径）。
- 若 `sourceToolUseID` 不存在，fallback 到 `lastToolUseId`（实时流路径，从有序日志中最近一条 tool_result 获取）。
- 两者都不存在时：打印 `[deriveThread] skill body: no toolUseId available` 警告并跳过。
- 找到 `toolUseId` 但匹配不到 tool-call part 时：打印 `[deriveThread] skill body: no matching tool-call found` 警告。

**非 skill 的 isMeta/isSynthetic 内部消息**：
- `assistant` 类型 + `model === "<synthetic>"` → 跳过（compact 取消等内部通知）。
- `assistant` 类型 + `isMeta/isSynthetic` + `parentUuid` → `attachSyntheticToParent` 挂到父 bubble。
- 无 `parentUuid` 也无 `sourceToolUseID` → 跳过不渲染。

---

### 顶层辅助字段

这些字段存在于多种消息的顶层（不在 `message.content` 内），提供工具执行和任务追踪的元数据。

#### `tool_use_result` / `toolUseResult`

**含义**：工具执行的**结构化结果**。与 `message.content` 中的 `tool_result` 文本描述互补——前者是人可读的描述，后者是机器可读的结构化数据。

**出现位置**：`user` 消息的顶层（当消息包含 `tool_result` content block 时）。

**字段名注意**：真实 Claude CLI JSONL 当前会出现 **camelCase `toolUseResult`**。我们自己的类型与部分早期实现里曾写成 snake_case `tool_use_result`，因此前端兼容层应同时接受两种写法，但以 `toolUseResult` 视为第一手协议事实。

**值类型注意**：它**不总是对象**。常见情况：

- 成功工具：对象（如 `questions/answers`、`task` 等结构化数据）
- 某些错误工具结果：字符串（如 `"Error: Invalid pages parameter..."`）

**示例**（TaskCreate 工具返回）：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{ "type": "tool_result", "tool_use_id": "...", "content": "Task #1 created" }]
  },
  "toolUseResult": {
    "task": { "id": "1", "subject": "Research quantum computing" }
  }
}
```

**TaskCreate 的真实 id 来源**：上例 `toolUseResult.task.id` 是工具执行后 CLI 回填的**权威 task id**。关键陷阱：tool_use 阶段（assistant 的 `TaskCreate` 调用）input **不含 id**——真实 id 只在随后的 tool_result（user 消息）顶层 `toolUseResult.task.id` 出现。客户端若从 `TaskCreate`/`TaskUpdate` 工具调用维护 task 列表（与 `system.task_*` telemetry 并行），必须：

1. tool_use 阶段先用 `tool_use_id`（tool_use 的 `block.id`）作为**临时 id** 占位创建 task；
2. tool_result 到达时，通过 `content[].tool_use_id` 关联回该 tool_use，把真实 `toolUseResult.task.id` 回填为 task id；
3. 后续 `TaskUpdate(input.taskId=真实 id)` 才能命中——否则 tool_use_id 占位 id 与真实 id 不匹配，task 状态永远不更新（这正是历史上 TaskCreate 任务 id 错乱的根因）。

实时流用 snake_case `tool_use_result`、JSONL/回放用 camelCase `toolUseResult`（见上方「字段名注意」），两种写法都要接受。

**TaskUpdate 的 status 状态机**：`TaskUpdate` 工具调用的 `input.status` 驱动任务状态流转，客户端应**直接用该字符串驱动 reducer**，不要预翻译成布尔特例（`isCompleted`/`isDeleted` 等）：

| input.status | 语义 | 处理 |
| --- | --- | --- |
| `pending` | 待办 | 设为 pending；也是 `TaskCreate` 的隐式初始态（见下文末句） |
| `in_progress` | 进行中 | 设为 in_progress |
| `completed` | 完成 | 设为 completed |
| `deleted` | 删除 | **从列表移除**（任意状态 → deleted） |
| 缺省（仅含 `addBlockedBy`/`addBlocks`） | 改依赖关系，不改状态 | **保留原 status**，绝不能重置为进行中 |

`error` 通过 `input.error`（或 `system.task_updated.error`）表达；`backgrounded` 来自 `system.task_updated.isBackgrounded` telemetry，**不是** TaskUpdate 的 status 取值。`TaskCreate` 的 `tool_result.task` 只有 `{id, subject}`、无 status。跨 session JSONL 实测：`TaskUpdate` 的 `input.status` 永远是 `in_progress` 或 `completed`、从不为 `pending`，故 `pending` 是 `TaskCreate` 后、首次 `TaskUpdate(in_progress)` 前的**隐式初始态**（并非"默认进行中"——早先文档此处有误）。

**示例**（错误工具结果）：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "...",
        "content": "<tool_use_error>Invalid pages parameter...</tool_use_error>",
        "is_error": true
      }
    ]
  },
  "toolUseResult": "Error: Invalid pages parameter..."
}
```

**处理方法**：

1. 提取 `toolUseResult` / `tool_use_result` 中的结构化数据用于 task 列表、状态更新等
2. 不用于替代 `message.content` 中的 tool_result 文本渲染
3. AskUserQuestion 的历史回放应优先读取这里的 `answers`、`questions`，不要只依赖回显字符串做解析
4. 读取前先判定类型；不要假设它一定是对象

**补充验证**：`task_started` / `task_updated` / `task_notification` 的回放恢复应分别覆盖“新建条目”和“更新已有条目”两种路径；`task_updated` 会根据 `isBackgrounded` 与 `error` 切换状态，而 `task_notification` 负责把完成文本写回 task 列表。
**含义**：标记此消息是由哪个父 tool_use 触发的。用于追踪工具调用链。

**出现位置**：`user`、`system` 等消息的顶层。

**处理方法**：用于 UI 中的层级展示和关联追踪。

#### 消息级 `session_id`

**含义**：消息所属的 CLI session UUID。与 `system.init` 中的 `session_id` 值相同，但出现在多种消息的顶层。

**出现位置**：大多数 stdout 消息的顶层。

**处理方法**：可用于客户端侧的消息来源校验。

---

#### `assistant` — AI 回复

**含义**：Claude AI 的回复内容，流式发送，同一回复可能跨多行。`message.id` 标识同一个回复——相同 id 的 consecutive assistant 消息应合并到同一个对话气泡。

**字段**：

| 字段                  | 类型          | 说明                                             |
| --------------------- | ------------- | ------------------------------------------------ |
| `type`                | `"assistant"` | 消息类型                                         |
| `message.id`          | string        | 本回复的唯一标识（多次流式发送共享同一 id）      |
| `message.role`        | `"assistant"` | 角色                                             |
| `message.model`       | string        | 生成此消息的模型（如 `"claude-sonnet-4-6[1m]"`） |
| `message.content`     | array         | 内容块数组，每个块有独立的 `type`                |
| `message.usage`       | object?       | token 使用统计                                   |
| `message.stop_reason` | string?       | 停止原因（`"end_turn"`, `"tool_use"` 等）        |

**content 块类型**：

##### `text` — Markdown 文本

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"text"` | 块类型 |
| `text` | string | Markdown 格式文本，直接渲染为对话内容 |

##### `thinking` — 推理过程

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"thinking"` | 块类型 |
| `thinking` | string | 推理文本（需 `--verbose` 参数） |
| `signature` | string | 推理内容签名，用于验证完整性 |

映射为 assistant-ui 的 `reasoning` 类型，渲染时可折叠的 Thinking 面板（amber 配色，默认折叠）。

##### `tool_use` — 工具调用申请

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"tool_use"` | 块类型 |
| `id` | string | tool_use 唯一标识（如 `call_00_rM9AbdxW5e4s1Q6zWOCK8957`） |
| `name` | string | 工具名称（`"Bash"`, `"Write"`, `"TaskCreate"`, `"Skill"`, `"AskUserQuestion"` 等） |
| `input` | object | 工具参数，结构因工具不同而异 |

映射为 `tool-call` 类型，等待 `tool_result` 匹配。

##### `message.stop_reason` — 停止原因

| 值 | 出现次数（本会话） | 说明 |
|---|---|---|
| `"tool_use"` | 879 | Claude 申请工具调用，暂停等待执行 |
| `"end_turn"` | 79 | Claude 完成本轮回复 |
| `"stop_sequence"` | 6 | 命中 stop sequence |

**处理方法**：

1. **相同 `message.id` 的 assistant 消息合并**到同一个对话气泡中（流式发送时 content 逐块追加）
2. `message.model === "<synthetic>"` —— CLI 内部消息（如 compact 取消通知），**必须跳过不渲染**
3. text 块 → 渲染为 Markdown
4. thinking 块 → 映射为 `{ type: "reasoning", text: block.thinking }`，渲染时可折叠的 Thinking 面板（amber 配色，默认折叠）
5. tool_use 块 → 映射为 `{ type: "tool-call", toolCallId: block.id, toolName: block.name, args: block.input }`，渲染为工具调用卡片，等待 tool_result 填充结果
6. 新的 `message.id` 出现时，flush 之前的 assistant 气泡并开始新的

---

#### `user` — 用户输入

**含义**：用户的输入消息。来源于两个渠道：(1) 用户通过 Web UI 输入（经服务端 relay 注入回传），(2) CLI JSONL 历史回放。

**两种 content 形态**：

**数组形式**（用户文本输入 + 工具结果）：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      { "type": "text", "text": "用户输入的内容" },
      { "type": "tool_result", "tool_use_id": "toolu_uuid", "content": "工具输出..." }
    ]
  }
}
```

| content 块类型  | 关键字段 | 说明 |
| --------------- | -------- | ---- |
| `"text"` | `text: string` | 用户输入的文本，渲染为用户对话气泡 |
| `"tool_result"` | `tool_use_id: string`, `content: string \| array`, `is_error?: boolean` | 工具执行结果，应匹配到对应 tool-call 的 `result` 字段 |

**`tool_use_id` 是匹配 tool_result → tool_use 的权威字段**。

数据验证（f4dd7cbe，1080 条 tool_result）：1077/1080（99.7%）中 `parentUuid` 指向包含对应 `tool_use_id` 的 assistant 消息——两者一致。但 3/1080（0.3%）不匹配，发生在**并行工具调用乱序完成**时：CLI 允许多个工具并发执行，先完成的先写 JSONL，导致 `parentUuid` 链与工具语义父节点不一致。而 `tool_use_id` 始终指向正确的工具调用。

CLI 源码确认：
```
// tool_result 创建（从 subagent 代码）：
return { type: "tool_result", tool_use_id: A.id, content: Y }

// tool_result 匹配（从消息处理逻辑）：
z.type === "tool_result" && z.tool_use_id === H
```

**实现规则**：前端匹配 tool_result → tool-call **必须使用 `tool_use_id`**，不得使用 `parentUuid`。`parentUuid` 仅用于消息树结构组织。

`tool_result.content` 可以是字符串（简单文本结果）或数组（`[{ type: "text", text: "..." }]`）。

**字符串形式**（CLI 内部命令输出）。`message.content` 为字符串时，有四种模式：

| 模式 | 出现次数 | 示例 | 处理方式 |
|---|---|---|---|
| 纯文本用户输入 | 93 | `"我们之前做了一次优化..."` | 渲染为用户对话气泡 |
| `<local-command-caveat>` | 4 | `<local-command-caveat>Caveat: The messages below...</local-command-caveat>` | `isMeta:true`，跳过（CLI 内部指令说明，给模型看的） |
| `<command-name>` / `<command-args>` / `<command-message>` | 4 | `<command-name>/clear</command-name><command-message>clear</command-message>` | command-output 卡片（命令输入回显），与紧邻的 stdout 合并 |
| `<local-command-stdout>` / `<local-command-stderr>` | 4 | `<local-command-stdout>Set model to sonnet (claude-sonnet-4-6)</local-command-stdout>` | compact 窗口内（内容为 `"Compacted"`）由 compact-block 吸收；否则 → command-output 卡片（命令输出） |
| `<bash-input>` / `<bash-stdout>` / `<bash-stderr>` | — | `<bash-input>ls</bash-input><bash-stdout>file.txt</bash-stdout>` | command-output 卡片（`sourceType:"bash"`，`!` 命令回显） |

**User 顶层标记变体**。user 消息的顶层有若干布尔标记组合，决定其渲染语义：

| 变体 | 出现次数 | 说明 |
|---|---|---|
| `hasToolUseResult`（顶层 `toolUseResult` 字段） | 1080 | 工具执行结构化结果（见下方 `tool_use_result` 章节） |
| `plain`（无特殊标记） | 103 | 普通用户输入文本 |
| `isMeta` | 5 | CLI 内部消息，`isMeta: true` 不渲染为用户气泡；若有 `sourceToolUseID` 则挂到对应 tool-call 元数据 |

**处理方法**：

1. **数组 content**：
   - `text` 块 → 累积到 `userTexts`，然后生成 `role: "user"` 对话气泡
   - `tool_result` 块 → 通过 `tool_use_id` 匹配到之前的 `tool-call`，设置其 `result` 字段。这是匹配的**唯一权威方式**（不使用 `parentUuid`）。如果匹配的 tool-call 已被 flush 到之前的 assistant 消息中，则回溯查找并更新
   - `is_error: true` 的 tool_result → 设置 `isError` 标记，显示错误状态
   - **tool_result-only（无 `text` 块）用户消息不渲染为气泡**：只消费 tool_result 匹配，不创建新消息条目
   - **text + tool_result 混合**：text 部分渲染为棕色气泡，tool_result 同时匹配到 tool-call
2. **字符串 content / 命令回显消息族**（slash command 与 `!` bash）：
   - `<local-command-caveat>` → `isMeta:true`，由 isSkillBody 分支跳过（CLI 内部，给模型看）
   - `<local-command-stdout>` / `<local-command-stderr>` / `<command-name>` / `<command-args>` / `<command-message>` / `<bash-input>` / `<bash-stdout>` / `<bash-stderr>` → 解析标签，产出 `command-output` ChatStreamItem（弹窗式命令卡片，详见下节「local-command / bash 命令回显消息族」）；compact 窗口内（内容为 `"Compacted"`）由 compact-block 吸收
   - 其他无结构内容的裸 CLI 命令标签 → 跳过
3. 纯文本用户消息（无 tool_result）生成用户对话气泡

#### local-command / bash 命令回显消息族

用户执行 slash 命令（`/model`、`/cost`、`/compact` 等）或 `!` bash 时，CLI 在 stdout 回吐 `type:"user"`、`message.content` 为**字符串**、内容用 XML-like 标签包裹的消息。这些不是真实用户输入，而是命令执行反馈，**必须渲染成可视化卡片**（用户输入后需看到反馈），不能 drop。

| 标签 | 类别 | 说明 | isReplay | isMeta |
|---|---|---|---|---|
| `<command-name>` | 命令输入 | slash 命令名，如 `model` | — | — |
| `<command-message>` | 命令输入 | 命令名/技能格式（`Skill(name)`） | — | — |
| `<command-args>` | 命令输入 | 命令参数 | — | — |
| `<local-command-stdout>` | 命令输出 | 本地命令标准输出（如 `Set model to sonnet`） | 可 `true` | — |
| `<local-command-stderr>` | 命令输出 | 本地命令标准错误 | 可 `true` | — |
| `<local-command-caveat>` | 命令输出 | 给模型的附注 | — | **`true`** |
| `<bash-input>` | bash 回显 | `!` 命令输入 | — | — |
| `<bash-stdout>` | bash 回显 | bash 标准输出 | — | — |
| `<bash-stderr>` | bash 回显 | bash 标准错误 | — | — |

**消息组成规律**：
- 简单命令（如 `/model sonnet`）只产生一条 `<local-command-stdout>`。
- 复杂命令（如 `/compact`、`/cost`）可能产生多条相邻 user 消息：先一条 `<command-name>` + `<command-args>`（命令输入回显），紧跟一条 `<local-command-stdout>`（输出）。
- `<local-command-caveat>` 始终带 `isMeta:true`，由 isSkillBody 分支 drop（给模型看的，UI 不展示）。

**重要：live stdout 与 JSONL replay 的命令消息形态不同**

同一条 slash 命令在两条路径上的表示并不相同，`normalizeChatStream` 需要把两条路径归一到同一个 `command-output` 语义：

| | 实时流（live stdout + API echo） | 历史回放（JSONL resume） |
|---|---|---|
| 命令输入 | API 注入 `user` echo：`{ role: "user", content: "/cost" }`（纯文本） | 多数命令持久化为 `user`：`{ content: "<command-name>/usage</command-name>..." }`（XML 标签）；部分命令（`/status` 等，CLI 未文档化行为）输入持久化为 `system/local_command` 纯文本 `"/status"`（无 XML 标签，form D） |
| 命令输出 | CLI 发送 `assistant` + `model: "<synthetic>"`，body 为输出文本 | JSONL 持久化为 `system` + `subtype: "local_command"`：`{ content: "<local-command-stdout>Total cost:...</local-command-stdout>" }` |
| 合并方式 | `pendingSlashItemIdx` FIFO 记录纯文本 user echo 的 item 索引；synthetic 到达时就地把该 echo item 改写为 `command-output`（命令名/args 来自 echo 文本，stdout 来自 synthetic body）；命令无 synthetic 输出时 echo 保留为用户气泡（fallback，不丢失） | 把命令输入片段（`user` tag 或 `system/local_command` 纯文本，有 commandName）与输出片段（`system/local_command` stdout，无 commandName）识别为相邻 `command-output` 后由 Pass B 合并 |
| 典型命令 | `/cost`、`/model`、`/help` | `/cost`、`/model`、`/reload-skills` |

部分命令（如 `/reload-skills`）在 JSONL 中会**双重复制**：既保留了 synthetic assistant 回声，又保留了 `user` tag + `system/local_command`。`normalizeChatStream` 的合并 Pass A 会先把 synthetic echo 折叠进紧随其后的 tag-based `command-output`，再由 Pass B 与 `system/local_command` 输出合并，最终只剩一张卡片。

**form D（纯文本输入）**：部分命令（`/status` 等）的输入在 JSONL 中以 `system/local_command` 纯文本 `"/status"` 持久化（无 XML 标签，CLI 未文档化）。`hasCommandArtifactTags` 不匹配，改由 `/` 前缀检测识别为输入片段（`buildCommandOutputItemFromPlainText`：commandName 取首 token 去斜杠、余下 token 为 args、stdout 留空），再由 Pass B 与紧随的 `<local-command-stdout>` 输出合并成单卡片。非 `/` 开头的纯文本仍落入 fallback，不误卡片化。

**form C（单输出，命令名推断）**：少数命令只有一条 `<local-command-stdout>` 输出、无任何输入回显（既无 `user` tag 也无纯文本 echo），合并后 `commandName` 为空。Pass D（在 Pass A/B 之后）用 `STDOUT_COMMAND_HINTS` 白名单对 stdout 首行做 `^`-anchored 匹配（`Set model to` → `model`、`Reloaded skills:` → `reload-skills`、`Total cost:` → `cost`）启发式推断命令名；未知输出保持 `commandName` 为空（不硬猜），`CommandOutputCard` 渲染通用标题。已有 commandName（form A/B/D/E）在 Pass D 跳过，不会被覆盖。

**form E（live 就地合并 + fallback）**：live 路径下，服务端注入的纯文本 `/status` user echo 不再独立渲染成用户气泡。`normalizeChatStream` 在 walk 时把 `/` 开头的 user-prompt item 索引压入 `pendingSlashItemIdx` FIFO；该命令的 synthetic assistant 到达时，就地把这个 user-prompt item 改写成 `command-output`（命令名/args 来自 echo 文本，stdout 来自 synthetic body，raw 快照合并），从而 live 斜杠命令也只产生一张卡片。若命令没有 synthetic 输出（如无效命令 CLI 无响应），echo item 不被改写、原样保留为用户气泡（fallback），用户输入不会丢失。

**`<command-name>` 标签值的前导 `/`**：JSONL 中 `<command-name>/usage</command-name>` 的 tag 值是 `"/usage"`（含前导斜杠），而 live 路径 `pendingSlash.shift()` 已经去掉斜杠（`"usage"`）。前端在 `buildCommandOutputItem` 中统一 `commandName.replace(/^\//, "")`，避免 `CommandOutputCard` 渲染成 `//usage`。

**渲染处理**（`web/src/routes/claude2-adapter.ts`）：
1. **识别**（纯函数 `parseCommandArtifactTags` / `hasCommandArtifactTags`）：用带反向引用的正则 `<tag>...</tag>` 提取标签内容，覆盖除 caveat 外的全部标签。string content 与 array text-block 两条路径都检测。
2. **产出**（`normalizeChatStream`）：识别到的命令回显消息产出 `kind: "command-output"` ChatStreamItem，携带 `commandName` / `args` / `stdout` / `stderr` / `input` / `sourceType: "local-command" | "bash"`。`system/local_command` 不再落入 fallback。
3. **合并**：三遍扫描。Pass A：synthetic assistant echo（有 stdout，可能无准确 commandName）紧跟 tag-based command-output（有 commandName，无 stdout）时，把 synthetic stdout 折叠进 tag 卡片。Pass B：相邻 `command-output` 输入（有 commandName）与输出（有 stdout 无 commandName）合并成一条，保证一条命令只产生一个卡片。Pass D：合并后仍无 commandName 的单 stdout 卡片（form C）用 `STDOUT_COMMAND_HINTS` 白名单启发式推断命令名。（form E 的 live echo→synthetic 合并在 walk 阶段就地完成，不经过 Pass A/B/D。）
4. **投影**（`renderChatStream`）：映射为 `role: "system"` + `content text: ""` + `systemMessageType: "command-output"` 的 ThreadMessageLike（复用 `mode-change` 的「非气泡系统消息」范式）。
5. **渲染**（`CommandOutputCard`）：列表内卡片预览（终端图标 + `/cmd` 或 `!cmd` 标题 + 输出首行）+ 点击 Dialog 弹窗展示完整 stdout/stderr/args/input 分区。

> 参考实现：hapi（`~/repos/hapi`）的 `CliOutputBlock` 是同类设计——正则识别、command-name 块与 stdout 块合并、Dialog 卡片 + shellscript 高亮。本项目在此基础上纳入 bash 标签，并用既有 `command-output` systemMessageType 接入 MessageRouter 分发。

**回显机制**：

CLI 在 `--output-format stream-json` 模式下**不会**将用户输入回显到 stdout。当前实现由服务端负责把用户输入重新注入 relay 的 live 缓冲，使当前连接和后续重连的客户端都能看到用户气泡：

```
客户端 sendToSocket({type:"user", ...})
  → server Claude2StreamController.message()
  → Claude2Runtime.write()
    → proc.stdin  // 直接写入 CLI stdin（pipe，非 FIFO）
  → Claude2Runtime.injectLiveLine(echo)  // 写入 relay.liveLines + 广播
    → WebSocket → 客户端 onmessage → setRawMessages
```

- 使用 `relay.injectLiveLine`（而非 `injectLine`），保证注入行进入 `liveLines` 并被 cap（5000 条上限），后续 `addSubscriber` 回放时可见。
- 服务端注入的 echo 会重新生成 `uuid`（`injected-${crypto.randomUUID()}`），避免与 CLI JSONL 中可能存在的同内容消息冲突。

**去重**：

- 前端不再做乐观更新；用户消息完全依赖服务端注入后从 WebSocket 到达。
- 工具结果（`tool_result` block）不经过乐观更新，由 relay 注入直接传递。

**`/reload-skills` 成功信号**：`/reload-skills` 是 local command（与 `/cost` 同类，**非** `control_request`）。CLI 先把输出持久化为 `system/local_command`（JSONL，带 `<local-command-stdout>` tag），再在 stream-json stdout 经 `localCommandOutputToSDKAssistantMessage`（`QueryEngine.ts` → `utils/messages/mappers.ts`）转成**合成 assistant 消息**（`model:"<synthetic>"`），并 strip 掉 tag，content 纯文本 = `Reloaded skills: N skills available`。这与 `/model` 切换的 `Set model to` 信号**载体不同**（后者走 user message，是 `control_request{set_model}` 路径）。agents-remote 把它作为**命令后置处理**触发点——服务端 fold 扫描所有 text location（`message.content` 任意 type + 顶层 `content`）匹配 strip 后的纯文本 `Reloaded skills: N skills`，检测到即下发 `skill_catalog_changed` 通知客户端刷新面板。这是后置处理框架的首个实例（命令透传 CLI + API 监听成功信号做副作用），完整设计见 [message-replay.md · 命令后置处理框架](../design/message-replay.md#命令后置处理框架)。

| | 实时流（live stdout） | 历史回放（JSONL resume） |
|---|---|---|
| 信号 | stdout 合成 assistant，content 纯文本 `Reloaded skills: N skills` → 服务端 fold 触发 | historyLines 不经 processStdoutLine → 不触发 fold |
| 面板刷新 | broadcast `skill_catalog_changed` → 客户端 invalidate 重取 REST catalog | route 重挂载自然重取 REST（`staleTime:Infinity` 但新 mount 触发 fetch） |

#### `!` bash 命令在 stream-json stdin 下的限制

**结论**：在 `--input-format stream-json` / `--output-format stream-json` 无头模式下，**客户端无法通过 stdin 触发 CLI 的 `!` bash 命令路径**。输入 `!ls` 会被 CLI 当作普通 `mode:'prompt'` 用户文本直接交给模型，模型把它当 prompt 回复。

**源码证据**（`~/repos/claude-code-sourcemap`）：

1. **`!` 前缀检测只在 REPL UI 层**：
   - `restored-src/src/components/PromptInput/inputModes.ts:16-21`：`getModeFromInput(input)` 对 `input.startsWith('!')` 返回 `'bash'`，否则 `'prompt'`。
   - `restored-src/src/components/PromptInput/PromptInput.tsx:872`：REPL 输入框在 onChange 中调用 `getModeFromInput(value)` 切换 `inputMode`。

2. **stream-json 输入循环硬编码 `mode:'prompt'`**：
   - `restored-src/src/cli/print.ts:4102-4109`：当 `structuredInput` 收到 `type:'user'` 消息时，直接 `enqueue({ mode: 'prompt' as const, value: ..., uuid: ... })`，不检查内容是否以 `!` 开头。

3. **无头模式明确拒绝非 prompt 命令**：
   - `restored-src/src/cli/print.ts:1936-1944`：`run()` 的 `drainCommandQueue` 中，若 `command.mode` 不是 `'prompt'` / `'orphaned-permission'` / `'task-notification'`，直接抛出 `Error('only prompt commands are supported in streaming mode')`。

4. **无头模式绕过 `processUserInput` 的 bash 门**：
   - `restored-src/src/cli/print.ts:2146-`：`run()` 将 command.value 作为 `prompt` 直接传给 `ask()`（模型查询）。
   - `restored-src/src/utils/processUserInput/processUserInput.ts:517-529`：只有在 `mode === 'bash'` 时才进入 `processBashCommand`，而无头模式既不会设置 `mode:'bash'`，也会在上一步被拦截。

5. **BashTool 名称**：`restored-src/src/tools/BashTool/toolName.ts:2` 定义 `BASH_TOOL_NAME = 'Bash'`，但这只影响模型发起的 tool_use，不影响 client 直接触发。

**对 probe 结果的解释**：

此前在 `scripts/probe-bash-protocol.ts` 中测试的 4 个候选 stdin 格式全部失败，原因正是上述代码路径不存在：
- `user content tool_use name=BashTool/Bash`：被 `processLine` 当作普通 `type:'user'` 消息，进入 prompt 路径交给模型。
- 顶层 `type:'tool_use'`：被 `processLine` 判定为未知类型，直接忽略（`logForDebugging('Ignoring unknown message type')`）。
- `{tool_name, tool_input}` 简化对象：同样被当作未知类型忽略。

** implication**：

如果产品要求 Web UI 里的 `!ls` 体验与交互式 CLI 完全一致（bash 结果进入对话上下文、可被模型引用），则必须等待 CLI 本身在 stream-json 模式下支持 `!` 解析（例如把 `!` 前缀识别为 bash 模式，或新增 `control_request{bash:...}` 子类型）。在 CLI 原生支持之前，任何 client/API 侧的 workaround 都不是“只对接 CLI”，而是绕过 CLI 自行执行 shell。

---

#### `external assistant` `isApiErrorMessage` — API 错误注解

**含义**：当 CLI 向 Anthropic API 发起请求失败时（如 500/529/overloaded），CLI 可能在 JSONL 中生成一条 `userType: "external"`、`isApiErrorMessage: true` 的 assistant 形消息。**这不是正常的 AI 回复**，而是附属于某条原始消息的错误注解——它通过 `parentUuid` 指回触发该 API 调用的原始消息（用户输入、工具结果、assistant 消息或 attachment）。

**出现位置**：JSONL 中此类型**必带** `isApiErrorMessage:true` + `parentUuid`（实测 8/8，error ∈ {server_error, unknown, rate_limit, …}）。CLI stdout 是否输出视 CLI 版本而定——实测 rate_limit 场景实时流会收到 `model:<synthetic>` + 顶层 `error` 分类字段的 assistant 形错误（可能不带 `isApiErrorMessage` 标记）；前端 `isExternalApiErrorMessage` 检测兼顾两种（`isApiErrorMessage===true` **或** 顶层 `error` 非空字符串）。

**关键字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"assistant"` | 消息类型（assistant 形，但不是正常回复） |
| `userType` | `"external"` | 来源类型 |
| `isApiErrorMessage` | `true` | 标记为 API 错误注解 |
| `error` | string | 机器可读错误分类（见下方） |
| `message.model` | `"<synthetic>"` | synthetic 标记 |
| `message.content[0].text` | string | 人类可读错误文本（如 "500 Request failed"） |
| `uuid` | string | 本条错误消息的唯一标识 |
| `parentUuid` | string | 指向触发该 API 调用的**原始 JSONL 消息** |

**`error` 错误分类**（从 98 条真实样本统计）：

| error 值 | 出现次数 | 含义 |
|---|---|---|
| `unknown` | 74 | 未分类/通用错误 |
| `server_error` | 18 | 服务器端错误（500/529 等） |
| `invalid_request` | 3 | 请求参数不合法 |
| `max_output_tokens` | 1 | 超过最大输出 token |
| `authentication_failed` | 1 | 认证失败 |

**样本 JSON**：

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_err_1737358310",
    "role": "assistant",
    "model": "<synthetic>",
    "content": [
      { "type": "text", "text": "500 Request failed" }
    ]
  },
  "userType": "external",
  "isApiErrorMessage": true,
  "error": "server_error",
  "uuid": "a1b2c3d4-...",
  "parentUuid": "e5f6a7b8-...",
  "isSidechain": false,
  "timestamp": "2026-01-20T15:31:50.123Z",
  "sessionId": "...",
  "cwd": "/home/user/project",
  "gitBranch": "main"
}
```

**parentUuid 指向的父消息类型分布**（98 条样本）：

| 父消息类型 | 数量 | 说明 |
|---|---|---|
| `user` / `tool_result` | 51 | 用户消息或工具结果触发的 API 调用失败 |
| `assistant` | 24 | assistant 处理过程中触发的 API 调用失败 |
| `attachment` | 14 | 附件处理过程中触发的 API 调用失败 |
| `system` | 9 | 系统级操作触发的 API 调用失败 |

**处理方法**：

1. **识别**：检查 `userType === "external"` 且 `isApiErrorMessage === true`。两个条件缺一不可。
2. **不作为独立消息渲染**：不要生成独立的 assistant bubble。它是对父消息的注解，不是用户面向的对话内容。
3. **按 `parentUuid` 挂载**：在消息 state 中查找 `parentUuid` 指向的原始消息所对应的可见 bubble，将错误作为 `metadata.custom.apiErrors` 附加到该 bubble 上。
4. **父消息解析规则**（`parentUuid` 指向的原始消息不一定自己渲染为 bubble）：

| 父原始消息类型 | 解析为目标 bubble 的规则 |
|---|---|
| `assistant`、`last-prompt`、自身即为可见 bubble | 直接挂到该 bubble |
| `user`（含 `tool_result`） | 若其 `tool_result.tool_use_id` 对应某个 assistant bubble 中的 tool-call，则挂到该 assistant bubble；否则沿 `parentUuid` 链找可见祖先 |
| `attachment`、不可见 `system` | 沿 `parentUuid` / `logicalParentUuid` 链找第一个可见祖先 bubble |
| 父消息尚未加载 | 暂存到 `pendingApiErrorsRef`，等待该消息加载后再尝试挂载 |

5. **多 error 同一 parent**：按 JSONL 中出现顺序保留，渲染时一条 parent bubble 可显示多条错误。
6. **error 先于 parent 到达**（live streaming 中）：放入 pending 队列；每次新增 normal bubble 后遍历 pending，尝试 match。

**UI 渲染**：

- 在 parent bubble 底部渲染紧凑的红色错误块（`ApiErrorAttachments` 组件）。
- 每条错误显示：错误分类 badge（如 `server_error`）+ 人类可读文本。
- Raw debug tooltip 同时展示原始消息和附加的 error raws（通过 `_rawMessages` 数组）。

---

#### `result` — 轮次结束

**含义**：每个用户→AI 交互轮次的结束标记。有三种子类型。

**字段**：

| 字段                 | 类型                                                               | 说明                                                                                          |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `type`               | `"result"`                                                         | 消息类型                                                                                      |
| `subtype`            | `"success"` \| `"interrupted"` \| `"error"` \| `"error_max_turns"` | 结果类型（**信封层**）                                                                        |
| `session_id`         | string                                                             | 会话 UUID                                                                                     |
| `uuid`               | string?                                                            | 消息唯一标识（result 带有 `uuid` 但**不写入 JSONL**，是 `uuid` 持久化规则的例外，见持久化章节） |
| `is_error`           | boolean?                                                           | 是否错误（`subtype: "error"` 时为 true）                                                      |
| `result`             | string?                                                            | 错误消息文本（`is_error: true` 时）                                                           |
| `api_error_status`   | number?                                                            | API 错误 HTTP 状态码（`subtype: "error"` 时；观测值）                                          |
| `stop_reason`        | string?                                                            | **模型层**停止原因（`"end_turn"` / `"tool_use"` …），与 assistant `message.stop_reason` 同义  |
| `terminal_reason`    | string?                                                            | **轮次层终态**（权威）：为何查询循环终止。12 值枚举，见下表                                   |
| `fast_mode_state`    | `"off"` \| `"cooldown"` \| `"on"`?                                 | fast 模式状态（schema 权威）                                                                  |
| `num_turns`          | number?                                                            | 累计轮次数                                                                                    |
| `total_cost_usd`     | number?                                                            | 累计费用（美元）                                                                              |
| `duration_ms`        | number?                                                            | **本轮 wall-clock 耗时**（schema: total wall-clock duration）；长会话观测值偏大，疑为累计，待复核 |
| `duration_api_ms`    | number?                                                            | 仅 API 调用累计耗时（不含本地处理）；观测值                                                   |
| `ttft_ms`            | number?                                                            | time-to-first-token 首 token 延迟（毫秒）；观测值                                             |
| `usage`              | object?                                                            | token 用量聚合：`input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens`（另有 `server_tool_use` / `service_tier` / `cache_creation` / `inference_geo` / `iterations` / `speed` 等观测子字段） |
| `modelUsage`         | object?                                                            | 按 model 分项：`inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens` / `costUSD` / `contextWindow` / `maxOutputTokens` / `webSearchRequests` |
| `permission_denials` | array?                                                             | 被拒绝的权限记录数组；观测值                                                                  |

> 标注「观测值」的字段来自真实 result 抓包，CLI 可能输出更多字段；`terminal_reason` / `fast_mode_state` 的枚举值来自 CLI 二进制 zod schema（v2.1.160），是权威来源。

**`terminal_reason` 枚举**（CLI 二进制 zod schema 权威）：

> schema 描述：*"Why the query loop terminated. Unset when the loop was bypassed (local slash command) or interrupted externally (budget/retry limits)."*

| 值                      | 含义                          |
| ----------------------- | ----------------------------- |
| `completed`             | 本轮正常完成                  |
| `aborted_streaming`     | 流式中断                      |
| `aborted_tools`         | 工具执行中断                  |
| `max_turns`             | 达到最大轮次上限              |
| `model_error`           | 模型错误                      |
| `image_error`           | 图像处理错误                  |
| `prompt_too_long`       | prompt 超长                   |
| `blocking_limit`        | 触发阻塞式限额                |
| `rapid_refill_breaker`  | 快速重试熔断                  |
| `stop_hook_prevented`   | stop hook 阻止完成            |
| `hook_stopped`          | hook 终止                     |
| `tool_deferred`         | 工具延迟                      |

`terminal_reason` 未设置的情况：本地 slash command 绕过查询循环，或被外部中断（预算 / 重试限额）。

**三层 terminal 语义**（不要混淆，三者描述的是不同层级）：

| 层     | 字段                                                              | 语义                                                |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| 模型层 | `stop_reason`（result 顶层 + assistant `message.stop_reason`）    | 模型为何停止**生成**（`end_turn` / `tool_use` …）   |
| 轮次层 | `terminal_reason`                                                 | 整个 turn 的查询循环为何**终止**（权威终态）        |
| 信封层 | `subtype`                                                         | result 消息本身的分类（`success` / `interrupted` / `error` / `error_max_turns`） |

UI 终态词应优先取 `terminal_reason`（→ tone），缺失时回退 `subtype`；`stop_reason` 仅用于调试。

```json
// 正常结束
{ "type": "result", "subtype": "success", "num_turns": 5, "total_cost_usd": 0.0123, "duration_ms": 60732, "session_id": "..." }

// 用户中断
{ "type": "result", "subtype": "interrupted", "num_turns": 3, "session_id": "..." }

// API 错误
{ "type": "result", "subtype": "error", "is_error": true, "result": "Model not found: claude-unknown", "session_id": "..." }
```

**处理方法**：

1. `result.success` / `result.interrupted` **不渲染聊天气泡**
2. 它们的核心作用是 **结束当前 turn**：
   - `flushAssistant()`：把当前 assistant parts 固化成最终气泡
   - `lastAssistantMsgId = null`：为下一轮 assistant 重新分组
   - `turnTokens/turnDuration` reset：清空本轮 thinking 元数据引用
3. 若存在 `duration_ms`，在 flush 前先写入共享 ref，供本轮 reasoning part 展示最终耗时
4. `result.error` 且 `is_error=true` 且 `result` 为字符串时：
   - 先 flush 当前 assistant
   - 再渲染一条 `role: "system"` 的 inline error divider
5. 在实时流里，`computeRunningCount()` 遇到任意 `result` 都会将 running counter **直接清零**
6. **turn-end 标记 + tool 中断判定**：每条 `result`（无论 subtype）都会产出一个不可见的 `turn-end` marker item（不渲染气泡，仅记录 turn 边界）。`applyToolLifecycle` 据此把「turn 已结束却未收到结果」的 tool / AgentContainer 标记为 `isInterrupted`（显示「中断」）。这是 tool 状态的**权威来源**——tool 状态完全由服务端 CLI 执行信号（`result` = turn 结束）推导，**不依赖客户端 `socketConnected`**。`result.interrupted`（用户中断）与 resume（进程退出、JSONL 无 result）两种路径最终都收敛到「中断」终态。
7. **turn-end footer 统计回填**：`turn-end` marker 同时携带从 `result` 提取的统计（`terminal_reason` / `subtype` / `num_turns` / `total_cost_usd` / `duration_ms` / `usage.input_tokens` / `usage.output_tokens`），渲染时回溯 stamp 到**本轮最后一个 assistant 气泡**底部的 `metadata.custom.turnStats`，显示 `[状态词] · N 轮 · $cost · tokens↓/↑ · 时长`。状态词由 `terminal_reason`（→ tone）决定，缺失回退 `subtype`；stamp 范围用 turn 边界限定，避免跨 turn 串色。因 `result` 不写 JSONL，footer 是 **live-only**——resume / 历史回放不显示。

**实时流 vs 历史回放**：

| 场景     | 消息信号                                 | UI 作用                                                                                             |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 实时流   | stdout 中收到 `result.*`                 | 结束当前 turn、写入 reasoning 最终 `duration_ms`、清零 `isRunning`                                  |
| 历史回放 | Claude CLI JSONL **通常不包含 `result`** | 通过 replay batch 中 assistant 最终态 + 用户文本边界重建同一最终 UI；不会回放一个单独的 result 记录 |

**关键结论**：

- `result.success` 不是“展示成功”的 UI 消息，而是**turn 生命周期边界信号**
- 它在实时流中是必要的；在历史 JSONL 中通常缺失，所以历史回放必须靠其他稳定边界（尤其是下一条用户文本）恢复最终状态
- 因此“历史回放与实时流最终效果一致”不等于“二者拥有同一套原始消息”——`result` 就是最典型的差异之一

---

#### `control_request` — 权限请求

**含义**：CLI 通过 `--permission-prompt-tool stdio` 将工具权限确认请求路由到 stdout。阻塞等待客户端的 `control_response`。

**字段**：

| 字段                   | 类型                | 说明                                                    |
| ---------------------- | ------------------- | ------------------------------------------------------- |
| `type`                 | `"control_request"` | 消息类型                                                |
| `request_id`           | string              | 请求 UUID（响应时回传）                                 |
| `request.subtype`      | `"can_use_tool"`    | 请求子类型                                              |
| `request.tool_name`    | string              | 工具名称（`"AskUserQuestion"`, `"Bash"`, `"Write"` 等） |
| `request.tool_use_id`  | string              | 对应 `assistant` 消息中 `tool_use.id` 的精确匹配键       |
| `request.display_name` | string              | 工具显示名                                              |
| `request.input`        | object              | 工具参数                                                |

```json
{
  "type": "control_request",
  "request_id": "uuid",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "AskUserQuestion",
    "tool_use_id": "toolu_XXXX",
    "display_name": "AskUserQuestion",
    "input": {
      "questions": [
        {
          "question": "...",
          "header": "Color",
          "options": [{ "label": "Red", "description": "..." }]
        }
      ]
    }
  }
}
```

**处理方法**：

1. 通过 `request.tool_use_id` 精确匹配 `rawMessages` 中对应 assistant 消息的 `tool_use.id`，将 `request_id` 注入为 `input.__controlRequestId`
2. 注入后 `makeToolRenderer` 检测到 `__controlRequestId`，切换为 amber 脉动权限确认卡片（allow/deny 按钮），用户响应后通过 bridge 发送 `control_response`
3. `AskUserQuestion` 有独立 `AskUserQuestionToolUI` 卡片（不使用 `makeToolRenderer`），同样通过 `__controlRequestId` 激活 `bridge.respondToControlRequest` 路径

**历史特性**：`control_request` 是 stdout 运行时控制消息，**不写入 Claude CLI JSONL 历史**。因此 AskUserQuestion 的历史页只来自 assistant `tool_use` 本身和后续 `user.tool_result` 顶层的 `toolUseResult.answers/questions`。`request_id` 注入只发生在实时流。

**AskUserQuestion 卡片 UI 行为**（`AskUserQuestionCard`，客户端实现，非协议要求）：

- `questions[].options[].preview`：markdown 字符串（常含代码块/表格），live 流（snake：`tool_use`/`control_request`）与 JSONL 历史（camel：`toolUseResult.questions`）均携带；adapter 整体透传 `questions` 数组（无白名单过滤）。前端在用户**选中**某选项后于该选项下方就地展开渲染，切换选项时 preview 跟随；不参与提交（提交只发选中的 label）。
- **Other 选项**：协议 `options` 无此字段，UI 层在每个有 options 的 question 底部自动追加 "Other" 伪选项（对齐 AskUserQuestion 工具"There should be no 'Other' option, that will be provided automatically"）。单选（`multiSelect:false`）下 Other 与选项**互斥**（激活 Other 清空选项选择）；多选（`multiSelect:true`）下与选项**共存**（Other 自定义文本追加到答案）。Other 文本作为该 question 的 answers 值。
- **全答完门禁**：客户端产品决策——所有 question 都有答案（选中选项，或 Other 文本非空）才解锁提交按钮；多 question 时按钮显示进度 `n/total`。

---

### 客户端 → CLI（stdin）

以下消息通过 WebSocket 发送到 API server，server 将它们写入 CLI 的 stdin FIFO。

---

**含义**：用户通过聊天输入框发送的文本消息，或 AskUserQuestion 工具 UI 选择的答案（以 tool_result 形式）。

```json
// 文本消息
{ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": "用户输入" }] } }

// 工具结果
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_uuid", "content": "结果" }] } }
```

**发送时机**：

1. 用户在输入框输入文字并按 Enter
2. AskUserQuestion 工具 UI 中用户选择答案后，通过 bridge 发送

**服务端行为**：

1. 写入 CLI stdin FIFO（`claude2Runtime.write()`）
2. 同时通过 `relay.injectLine()` 将消息注入 relay buffer 并广播回客户端

---

#### `control_response` — 响应权限请求

**含义**：客户端对 `control_request` 的响应。允许或拒绝工具使用。

```json
// 允许（带 updatedInput）
{ "type": "control_response", "response": {
  "subtype": "success", "request_id": "uuid",
  "response": { "behavior": "allow", "updatedInput": { "answers": { "q": "a" }, "其他字段": "值" } }
} }

// 拒绝
{ "type": "control_response", "response": {
  "subtype": "success", "request_id": "uuid",
  "response": { "behavior": "deny", "message": "User skipped" }
} }
```

注意：`request_id` 在 `response` 对象内，不在顶层（与 Claude SDK 的 `CanUseToolControlResponse` 格式一致）。

**发送时机**：AskUserQuestion 工具 UI 中用户点击提交/跳过按钮时。

---

#### `control_request` (interrupt) — 中断执行

**含义**：用户点击停止按钮，中断当前正在执行的 AI 回复。

```json
{ "type": "control_request", "request_id": "uuid", "request": { "subtype": "interrupt" } }
```

发送后 CLI 返回 `result` 消息（`subtype: "interrupted"`）。

---

### control_request subtype 全表

`control_request` 是双向控制协议：host→CLI 的请求由 CLI 回 `control_response{success/error}`；CLI→host 的请求（`can_use_tool` / `elicitation` / `hook_callback`）需要 host 回 `control_response`。所有请求都带 `request_id` 用于配对。CLI 共有 **21 种** `control_request` subtype（源自 `entrypoints/sdk/controlSchemas.ts` 的 `SDKControlRequestInnerSchema`）：

| subtype | 方向 | 用途 |
|---|---|---|
| `interrupt` | host→CLI | 中断当前正在运行的 turn |
| `set_model` | host→CLI | 设置后续 turn 使用的模型 |
| `set_permission_mode` | host→CLI | 设置工具权限模式 |
| `set_max_thinking_tokens` | host→CLI | 设置 extended thinking token 上限 |
| `stop_task` | host→CLI | 停止运行中的 task |
| `initialize` | host→CLI | SDK 会话初始化（hooks / MCP servers / agents 配置） |
| `apply_flag_settings` | host→CLI | 合并 flag 设置层，更新生效配置 |
| `get_settings` | host→CLI | 查询生效的合并设置 + 各来源原始设置 |
| `get_context_usage` | host→CLI | 查询上下文窗口用量分类明细 |
| `mcp_message` | host→CLI | 向指定 MCP 服务器发 JSON-RPC 消息 |
| `mcp_set_servers` | host→CLI | 替换动态管理的 MCP 服务器集 |
| `mcp_reconnect` | host→CLI | 重连失败 / 断开的 MCP 服务器 |
| `mcp_toggle` | host→CLI | 启用 / 禁用某 MCP 服务器 |
| `mcp_status` | host→CLI | 查询所有 MCP 服务器连接状态 |
| `reload_plugins` | host→CLI | 从磁盘重载插件，返回刷新后的 commands / agents / plugins |
| `rewind_files` | host→CLI | 回滚自某 user message 以来的文件改动 |
| `seed_read_state` | host→CLI | 用 path + mtime 种子化 readFileState 缓存 |
| `cancel_async_message` | host→CLI | 按 uuid 从命令队列丢弃一条 pending 异步消息；返回 `{cancelled: bool}`。**唯一携带命令队列状态的 RPC**（详见 [命令队列与消费语义](#命令队列与消费语义)） |
| `can_use_tool` | CLI→host | 请求授权使用某工具（权限确认，见上方 `control_request — 权限请求` 节） |
| `elicitation` | CLI→host | 请求 host 处理 MCP elicitation（用户表单输入） |
| `hook_callback` | CLI→host | 交付 hook 回调及其输入数据给 host |

> 💡 **方向约定**：host = 外部进程（本文档场景下即 API server / 前端）；CLI = Claude CLI 进程。host→CLI 的 subtype 是我们主动调用 CLI 的能力；CLI→host 的 subtype 是 CLI 请求我们处理（必须响应）。

---

### WebSocket 传输层消息

这些消息是 API server 在 WebSocket 层添加的，不是 CLI 原始输出。

#### `snapshot` — 会话快照

**含义**：会话当前的完整输出快照。用于首次连接、重连或输入变更后的全量同步。

**字段**：`type: "snapshot"`, `data: string`

**处理方法**：

1. 作为完整文本快照替换本地控制台输出状态
2. 只出现在 WebSocket 传输层，不属于 Claude CLI stdout JSONL

---

#### `output` — 增量输出

**含义**：相对于上一个 `snapshot` 的增量文本输出。

**字段**：`type: "output"`, `data: string`

**处理方法**：

1. 作为增量 append 到本地输出缓存
2. 只出现在 WebSocket 传输层，不属于 Claude CLI stdout JSONL

---

#### `status` — 传输状态

**含义**：WebSocket/会话传输状态变更，表示连接或者 session stream 的 transport 状态。

**字段**：`type: "status"`, `status: "connected" | "running" | "idle" | "closed" | "error"`

**处理方法**：

1. 作为 transport 状态源，不渲染为聊天消息
2. `status: "connected"` 用于通知客户端连接已经建立
3. 其他状态用于会话连接的生命周期 UI / 调试日志

---

#### `replay_start` — 回放开始

**含义**：服务端准备回放历史消息前发送的边界标记。

**字段**：`type: "replay_start"`

**处理方法**：

1. 告知客户端进入批量回放阶段
2. 通常配合 loading 状态，直到 `replay_end` 才恢复实时渲染

---

#### `replay_end` — 回放结束

**含义**：历史消息回放完毕，实时流重新接管。

**字段**：`type: "replay_end"`

**处理方法**：

1. 关闭 replay/loading 状态
2. `replay_end` 之后收到的消息视为实时消息队列

---

#### `ended` — 会话结束

**含义**：跟随在 `result` 消息后发送，表示一轮交互的流式输出已完全结束。

**处理方法**：可用于触发 UI 收尾动画或状态同步。

---

#### `error` — 传输层错误

**含义**：WebSocket 层面的错误，不是 CLI 错误（如 session 不存在、runtime 启动失败）。

**字段**：`type: "error"`, `code`, `message`

**处理方法**：显示为 inline 错误提示或 toast，告知用户连接出现问题。

---

#### `control_response` — 控制动作响应

**含义**：对客户端发起的 `control_request`（`set_model`、`set_permission_mode`、`interrupt`）的响应。权限响应（allow / deny）也是同一类型，但方向相反（client → CLI stdin）。

**字段**：`type: "control_response"`, `response: { subtype: "success" | "error", request_id: string, response?: {...}, error?: string }`

**关键**：`request_id` 与对应 `control_request.request_id` 相同，客户端据此匹配请求与响应。

**处理方法**：

1. `set_model` 成功 → 确认模型切换，递增 `modelSwitchVersion` 以强制 tool UI 重新渲染
2. `set_model` 失败 → 回退模型选择到之前的值，显示 error 信息
3. `set_permission_mode` 成功 → 确认权限模式切换
4. `set_permission_mode` 失败 → 回退权限模式
5. `interrupt` 成功 → 关闭当前 running turn（等价于 `result.interrupted`）

---

## 协议名索引（代码 → 文档）

下面这些名字在代码里会直接出现；本篇已在前文展开它们的语义，只是标题层级不总是单独按名字拆开：

- `compact_boundary` / `microcompact_boundary` → 见 `system / compact_boundary / microcompact_boundary`
- `task_started` / `task_updated` / `task_notification` → 见 `system / task_started|task_updated|task_notification`
- `tool_use` → 见 `assistant` 的 content 块类型
- `tool_result` → 见 `user` 的 content 块类型，以及 `tool_use_result / toolUseResult`
- `tool-call` → 见 `assistant` / `user` 的渲染规则（这是前端 UI part 名，不是 CLI 原始协议名）

所有消息归为两类。这个分类决定了实时流和回放是否需要区分处理。

### 瞬时事件（到达即终态，无"进行中"概念）

这类消息一旦到达就是最终形态，不会随时间推移改变内容或含义。**实时流和回放处理完全一致**——收到就渲染/执行，无需区分场景。

| 消息                                      | 为什么是瞬时事件         |
| ----------------------------------------- | ------------------------ |
| `system.init`                             | 会话元数据，发出即确定   |
| `system.compact_boundary`                 | 压缩记录，历史事实       |
| `system.api_retry`                        | 重试通知（**纯实时流，不写入 JSONL**，见 [持久化边界](#jsonl-与-cli-stdout-持久化边界)） |
| `system.turn_duration`                    | 耗时统计，事后记录       |
| `user`                                    | 用户输入，发送即确定     |
| `result`（所有 subtype）                  | 轮次结束标记，不可变     |
| `control_request`                         | 权限请求，即时事件       |
| `ended` / `error`（传输层）                | 连接事件，瞬时           |
| `control_response`                        | 控制动作响应，即时       |

**处理规则**：这些消息在 live broadcast 和 pushBuffer → replay 两条路径上**完全一致**。不需要在 live/replay 表格中为它们单独区分。

### 持续流（有进行中→完成生命周期）

这类消息有"还没结束"的中间态——内容在流式追加，状态可能从 running 转为 complete 或被中断。

| 消息                            | 进行中                                   | 完成                      | 异常                              |
| ------------------------------- | ---------------------------------------- | ------------------------- | --------------------------------- |
| `assistant`                     | content 流式追加，`isRunning=true`       | `result` 标记结束         | `result.subtype=interrupted` 中断 |
| `thinking_tokens`               | `estimated_tokens` 递增                  | 最后一条为总数            | 无（不产生最终计数）              |
| `tool_use` / `tool_result` 配对 | `tool_use` 已发送但 `tool_result` 未到达 | 匹配的 `tool_result` 到达 | `tool_result.is_error: true`      |

**`isRunning` 判定规则**：只要有任何上述消息处于"进行中"状态（开始已发生、结束未到达），`isRunning` 即为 `true`。所有三态消息都结束后，`isRunning` 才为 `false`。

**处理规则**：

- **进行中**：实时流逐条推送（broadcast），驱动进度动画；回放跳过中间 delta，只保留最终汇总
- **完成**：实时流和回放**最终效果一致**——都展示最终的静态状态
- **异常**：实时流和回放一致——都展示中断标记

### 一个统一的模型：所有消息最终都在"结束"态处理

大部分消息天生就是"结束"状态（瞬时事件）。`assistant` 和 `thinking_tokens` 是仅有的例外——它们有 streaming 进行中态，但最终也会到达"结束"（result）。

因此，实现时的默认规则是：

1. **默认按"结束"态处理**——只有明确有 streaming 行为的 `assistant` 和 `thinking_tokens` 才需要区分 live/replay
2. **在 buffer/pushBuffer/broadcast 层面**，瞬时消息不需要任何特殊逻辑
3. **`thinking_tokens` 是唯一需要特殊处理的**：实时 broadcast 逐条推送，pushBuffer 折叠为最终值

---

## 消息渲染语义总表

### thinking 生命周期（实时流 vs 历史回放）

`thinking_tokens` 是 per-chunk 增量进度信号，仅在实时流中有意义。历史回放时只保留最终汇总数据。

| 阶段                           | 实时流 — 消息信号                                                    | 实时流 — UI                                            | 历史回放 — 消息信号                                       | 历史回放 — UI                                       |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------- |
| **thinking 进行中**            | 多条 `thinking_tokens` 逐条到达，`estimated_tokens` 递增 (1→3→5…→39) | spinner + "Thinking… (39 tokens)"                      | 无 — `pushBuffer` 过滤，buffer 中不存在                   | 无 — 回放不展示进度动画                             |
|                                | `assistant` + `thinking` block 到达（含思考文本）                    | 可展开思考内容 + spinner + 实时 token 计数             | `assistant` + `thinking` block 在 replay batch 中         | 无 — batch 一次性 apply，无中间态                   |
| **thinking 完成（转入 text）** | 同 `message.id` 的 `assistant` + `text` block 到达                   | thinking 折叠，显示最终 token 数，text 正常渲染        | 同 `message.id` 的 `assistant` + `text` block 在 batch 中 | thinking 静态折叠，显示最终 token 数，text 正常渲染 |
| **turn 正常结束**              | `result` 到达，`isRunning=false`                                     | 静态 "Thinking"（折叠）+ 可展开查看思考内容 + token 数 | `result` 在 batch 末尾                                    | 同实时流最终效果一致：静态 "Thinking" + token 数    |
| **turn 被中断**                | `result.subtype=interrupted` 在 text 之前到达                        | "Thinking (interrupted)"，展开可查看部分思考内容       | 同左                                                      | "Thinking (interrupted)"                            |

**关键规则**：

- `thinking_tokens` 在实时流中通过 `broadcast` 原样推送给客户端，驱动进度动画
- `thinking_tokens` 通过 `pushBuffer` **折叠**（连续的多条只保留最后一条含最终 `estimated_tokens` 的），回放时一次性 attach 到 reasoning part
- `assistant` 在实时流中逐块追加，回放时 batch 一次性渲染为完整气泡
- complete 态的最终 token 数来源于最后一条 `thinking_tokens.estimated_tokens`，无论实时还是回放都要展示
- 回放的最终效果必须与实时流完成后一致（静态、有 token 数、可展开）
- 所有瞬时事件在 live broadcast 和 pushBuffer → replay 两条路径上处理完全一致

### 瞬时事件（实时流 ≡ 回放，无需区分）

| 消息                                             | 渲染方式                     | 关键逻辑                                                                                                                     |
| ------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `system.init`                                    | **不渲染**                   | 提取 model/permissionMode 更新 UI state                                                                                      |
| `system.status`                                  | **部分渲染**                 | 权限模式切换变体（`permissionMode`）渲染为 `mode-change` 内联提示 + 更新 `permissionMode`；compact 变体（`status:"compacting"`/`compact_result`）不渲染，由 CompactIndicator 处理 |
| `system.compact_boundary`                        | **inline**                   | `role: "system"` 压缩分割线。**测试覆盖**                                                                                    |
| `system.api_retry`                               | **瞬时状态（RetryIndicator）** | 不产 item；Pass-1 更新 `retryInfo` 标量 → spinner 胶囊（`attempt/max · error · 倒计时`），随每条更新、turn 结束自动消失 |
| `system.turn_duration`                           | **不渲染**                   | 仅调试日志                                                                                                                   |
| `user` (text)                                    | **用户气泡**                 | 文本→用户气泡                                                                                                                |
| `user` (tool_result)                             | **tool-call result**         | 匹配 tool-call 的 `result` 字段                                                                                              |
| `user` (`isMeta: true` + `sourceToolUseID`)      | **不渲染**                   | 附加到匹配 tool-call 的 `metadata.skillContent`。**测试覆盖**                                                                |
| `user` (`isMeta: true` 无 `sourceToolUseID`)     | **不渲染**                   | CLI 内部消息直接跳过                                                                                                         |
| `user` (string content `<local-command-stdout>`) | **command-output 卡片** | compact 窗口内（`"Compacted"`）由 compact-block 吸收；否则解析为 `command-output`，渲染为弹窗式命令卡片（`systemMessageType: "command-output"`） |
| `user` (string content `<command-name>` / `<command-args>` / `<command-message>` / `<bash-*>`) | **command-output 卡片** | 与相邻 stdout 合并为一条 `command-output`，弹窗展示完整输入/输出 |
| `user` (string content `<local-command-caveat>`) | **不渲染** | `isMeta:true`，由 isSkillBody 分支跳过 |
| `user` (string content 其他裸 CLI 标签) | **不渲染** | 无结构化内容的 CLI 内部消息跳过 |
| `user` (`toolUseResult` / `tool_use_result`)     | **structuredResult 附加**    | 挂到最近 tool-call 的 `structuredResult` 字段。值可以是对象或字符串。**测试覆盖**                                            |
| `assistant` (model=`<synthetic>`)                | **不渲染**                   | CLI 内部消息（如 compact 取消通知），跳过。**测试覆盖**                                                                      |
| `system.task_started`                            | **Task 列表**                | 加入输入框上方 task 列表，不产生聊天气泡。纯函数 `applyTaskSystemMessage`。**测试覆盖**                                      |
| `system.task_updated`                            | **Task 列表**                | 更新 task 列表中对应 task 状态。**测试覆盖**                                                                                 |
| `system.task_notification`                       | **Task 列表**                | 更新 task 列表中对应 task 输出/进度。**测试覆盖**                                                                            |
| `system.task_progress`                           | **Agent tool-card 内部**     | 通过 `tool_use_id` 匹配 tool-call part，注入 progress 字段。渲染为 subagent_type 标签 + description + 用量统计行              |
| `result.success` / `result.interrupted`          | **不渲染（产出 turn-end marker）** | `isRunning = false`。标记 turn 结束；同时驱动 `applyToolLifecycle` 把未拿到结果的 tool 标记为「中断」（见 [`result` 章节](#result--轮次结束) turn-end 条目） |
| `result.error` (`is_error`)                      | **inline**                   | `role: "system"` + `systemMessageType: "error"`                                                                              |
| `control_request`                                | **不渲染**                   | AskUserQuestion → 注入 request_id 到 assistant 的 tool_use                                                                   |
| `mode`                                            | **不渲染（过滤）**           | CLI 运行时心跳，永远 `"normal"`，无 UI 价值                                                                                  |
| `permission-mode`                                 | **不渲染**                   | 权限模式变更事件，更新 session metadata；不作为聊天消息                                                                      |
| `ended`                                           | **不渲染**                   | 连接状态管理                                                                                                                 |
| `error` (传输层)                                  | **inline / toast**           | 连接错误通知                                                                                                                 |
| `control_response`                               | **不渲染**                   | 匹配 `request_id` 更新 model / permission mode 标量（`set_model` / `set_permission_mode` / `interrupt` 的 CLI 回执）        |

**回归测试覆盖统计**：`claude2-adapter.test.ts` 共 241 个测试、585 个断言，覆盖了 `deriveThread` 的所有语义分类分支和 task 状态的完整生命周期。

### 持续流（有进行中→完成生命周期）

这些是唯一需要区分 live/replay 的消息。详见上方 [thinking 生命周期](#thinking-生命周期实时流-vs-历史回放) 表格。

| 消息              | 实时流 — 进行中                                   | 实时流 — 完成                          | 回放                                                                               |
| ----------------- | ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `assistant`       | content 流式追加，气泡实时更新                    | `result` 到达后固定                    | 一次性渲染完整气泡（无中间态）                                                     |
| `thinking_tokens` | 逐条 broadcast，`estimated_tokens` 递增，驱动进度 | 最后一条为总数（展示在 Thinking 面板） | pushBuffer **折叠**为最后一条（含最终总数），回放时一次性 attach 到 reasoning part |

## 生命周期

```
CLI 启动 (无 --resume)
  → [等待用户输入，无 stdout 输出]
  → 用户发送第一条消息
  → system.init            (会话配置)
  → assistant              (流式 AI 回复)
  → result                 (轮次结束)

CLI 启动 (--resume)
  → system.init            (从 JSONL 恢复的会话配置)
  → [compact_boundary...]  (压缩记录重放)
  → assistant / user       (历史消息重放，每轮以 result 结束)
  → [等待用户输入]

用户发送消息 (正常流)
  → user (stdin)
  → assistant              (流式，可能多行)
     ├─ text               (Markdown 文本)
     ├─ thinking           (推理过程，verbose 模式)
     └─ tool_use           (工具调用)
  → control_request        (如果工具需权限确认，阻塞等待 control_response)
  → user (tool_result)     (工具结果回显，顶层可能含 tool_use_result 结构化数据)
  → [assistant → tool_use → control_request → tool_result 循环]
  → result                 (轮次完成)

含 Skill 工具:
  → assistant (tool_use: Skill)
  → user (tool_result: "Launching skill: xxx")
  → user (isMeta: true, text content = skill SKILL.md 内容)  ← CLI 内部消息，不应渲染
  → assistant (tool_use: Bash/tvly 等具体命令)

含子任务 (TaskCreate/Workflow):
  → assistant (tool_use: TaskCreate)
  → user (tool_result: "Task #1 created", tool_use_result: {task: {id, subject}})
  → system.task_started     (子任务开始)
  → system.task_notification (子任务进度/完成通知)
  → system.task_updated     (子任务状态变更)
  → [子任务完成后] assistant 继续生成
```

### Compact 生命周期

CLI 进程**全程不退出**：`compact_boundary` 等重放标记是 CLI 在同一进程、同一 stdout 流内 inline 发出的，压缩后的轮次直接在同一进程继续流式输出（不存在「杀进程重启」）。

```
手动 /compact:
  status:"compacting" → [CLI 内部压缩] → compact_result →
  compact_boundary (重放标记) → assistant/user/result 重放 → 实时 assistant
  （重放是 CLI 进程内对压缩后上下文的重放，非进程重启拉起）

自动 compact (上下文满):
  compact_boundary (内联，无前置 status) → result → 实时 assistant
  （同进程内继续当前流）

微压缩:
  microcompact_boundary → 不重启 CLI，继续当前流
```

### 模型切换

进程内切换（CLI 进程不退出，relay 不重放历史）：

```
用户选择新 model
  → WebSocket 发送 control_request { subtype: "set_model", model }（带 request_id）
  → API server 原样写入 CLI stdin（claude2-stream.ts message()，进程不重启）
  → CLI 进程内切换 model，回 control_response { subtype: "success" | "error", request_id }
  → 前端按 request_id 匹配 pending action（claude2-adapter.ts）：success 应用新 model；error 回退 priorModel
```

### 权限模式切换

进程内切换（同上，CLI 进程不退出）：

```
用户选择新 permissionMode
  → WebSocket 发送 control_request { subtype: "set_permission_mode", mode }（带 request_id）
  → API server 原样写入 CLI stdin（进程不重启）
  → CLI 进程内切换 permissionMode，回 control_response { subtype: "success" | "error", request_id }；同时 CLI 自身 echo system.status{permissionMode}
  → 前端按 request_id 匹配：success 确认；error 回退 priorMode
```

> 两者都是 host→CLI 的 `control_request`（见 [subtype 全表](#control_request-subtype-全表)），CLI 在进程内切换并回 `control_response`。早期"杀进程重启 CLI + `switch_model_result`"的设计已废弃。

## 三维度运行态配置（model / permission / effort）

`model` / `permission` / `effort` 三个运行态可调维度——默认值来源、spawn 初始值、stream-json 运行时切换、TUI vs 无头能力差异、竞品方案、本项目对接现状——已独立成文：[Claude CLI 运行态三维度对接](./claude-cli-runtime-config.md)。它们部分属于 TUI 能力（非 stream-json 协议本身，effort 尤甚），故单独对接。

> 本节聚焦 stream-json 协议内的切换机制：下方 `### 模型切换` / `### 权限模式切换` 描述 `set_model` / `set_permission_mode` 两个进程内 control_request；effort 在 stream-json 下无对应 control（详见独立文档）。

## 命令队列与消费语义

这是 CLI 进程**内部**的命令队列（`utils/messageQueueManager.ts` 的模块级 `commandQueue` 单例）消费机制。理解它对"turn 中追加消息"场景（连续发送、排队、批量合并）至关重要。

### 入队（enqueue）：唯一路径是 stdin user 消息

命令队列只通过一条路径入队：stdin 收到 `{type:"user"}` 消息时（`cli/print.ts` 的 stream-json 主循环），`enqueue({mode:'prompt', value, uuid, priority})` 后**立即 `void run()`**（fire-and-forget）。**CLI 不回执、不 echo user、不通知排队状态**——这是我们被迫 `injectLiveLine` 的根因（见 [`message-replay.md`](../../design/message-replay.md)）。

> task-notification 等内部消息也走 enqueue（`enqueuePendingNotification`，priority=`later`），但那是 CLI 内部产生，不来自 stdin。

### 消费（dequeue）：只在 run() 进入时，FIFO + 优先级

`run()` 是消费的唯一点，受单点守卫保护：

```js
const run = async () => {
  if (running) return              // print.ts:1866 — turn 进行中，直接返回
  running = true
  ...
  while ((command = dequeue(isMainThread))) {  // print.ts:1935 — FIFO + 优先级批量消费
    ...处理一个 turn...
  }
  running = false                  // print.ts:2470
}
```

- **`dequeue` 不是纯 FIFO**：按优先级取最高（`now` > `next` > `later`），同优先级内才 FIFO（`messageQueueManager.ts` 的 `PRIORITY_ORDER`）。典型用户输入都是 `next`，所以实测表现为 FIFO；只有 task-notification（`later`）混入时优先级才显现。
- **`running=true` 期间到达的所有消息全部静默排队**，要等当前 turn 结束（`running=false`）才会被消费。

### run() 的触发时机

`void run()` 在多处被调用（user 消息后、compact / 模型切换 / 任务完成等事件后），但都被 `if (running) return` 守卫。**最关键的是收尾重检查**（`print.ts:2487-2495`）：

```js
// turn 结束、running 释放后，立刻 peek 检查队列:
if (peek(isMainThread) !== undefined) { void run(); return }
```

这保证"turn1 结束 → 自动接 turn2"：turn1 进行中排队的消息，在 turn1 结束、running 释放的瞬间被 peek 发现，重新触发 run() 消费。**不需要第二条消息自己再次触发**。

### 批量合并（canBatchWith）：连续排队消息合并成一个 turn

drainCommandQueue（`print.ts:1931-1960`）会把**连续排队的 prompt 消息**用 `canBatchWith`（`print.ts:443`）判断后合并成**一个 turn**（一条 `ask()` 调用 → 一条 assistant 回复），而非 N 个独立 turn：

```js
canBatchWith(head, next) =
  next.mode === 'prompt' && next.workload === head.workload && next.isMeta === head.isMeta
```

**对"turn 中追加消息"的影响**：

- 若第一条消息发出时 CLI 还 idle → 立即单独成 turn1 并开始回复；第二条在 turn1 进行中排队 → turn1 结束后被收尾重检查捞出，此时队列只有一条、无法 batch → 单独成 turn2。**结果：两条独立回复**。
- 若两条消息都在某个 turn 进行中排队（队列里同时有两条）→ drain 时 `canBatchWith` 命中 → 合并成**一条**回复（`joinPromptValues` 拼接，`uuid` 取最后一条）。**结果：一条回复对应两条 user 消息**。

### CLI 不对外暴露排队状态

stream-json 模式下，CLI **刻意不向外部消费者开放队列状态**：

- 不 echo user（实时 stdout 0 条 user 行）
- `queue-operation` 消息只写 JSONL 磁盘（见下方 [queue-operation 节](#queue-operation--cli-输入队列操作)），不进 stdout 实时流
- 没有任何"已排队 / 已出队 / 队列长度"的 stdout 信号

唯一的队列相关 RPC 是反向的 `cancel_async_message`（host→CLI，按 uuid 撤销队列中的 pending 消息，返回 `{cancelled: bool}`）——它证明 CLI 内部队列是精确的、uuid 寻址的，只是**入队路径不对外部回执**。

> 这是协议设计的取舍，不是能力缺失：queue 是 CLI 进程内 `commandQueue` 单例，服务它自己的 TUI REPL（React + `useSyncExternalStore` 订阅）；stream-json headless 模式假设"一问一答 / 追加"，把 enqueue 当内部实现细节。

---

## 我们的集成方式

```
Browser (WebSocket)  ←→  API server  ←→  CLI subprocess (Bun.spawn, stdin/stdout/stderr)
```

CLI 子进程通过 `Bun.spawn()` 直接管理，不再经过 tmux。stdin 直接写 `proc.stdin`，stdout 通过 `ReadableStream` 异步迭代逐行进入 relay。

### 旧版三层数据架构（已废弃）

服务端数据分为三个独立层次，各有明确的存储位置和加载时机：

| 数据层             | 存储位置                                                     | 构成                                                                 | 加载时机                                                               |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **磁盘历史 JSONL** | 磁盘文件（`~/.claude/projects/<project>/<sessionId>.jsonl`） | CLI 写入的完整会话历史，是会话内容的权威来源                         | 重连时按需读文件发送，**不驻留内存**                                   |
| **待刷新历史**     | relay 内存 buffer                                            | completed turn 中 JSONL 尚未包含的部分 + in-progress turn 的全部内容 | relay 从 CLI stdout 实时接收并推入；回放时用磁盘 JSONL 快照做 key 去重 |
| **实时消息队列**   | relay 内存                                                   | CLI stdout 当前正在流式到达的数据                                    | 实时 push → 实时 broadcast，同时写入待刷新历史                         |

**待刷新历史的构成**：

```
待刷新历史 = JSONL缺失内容 + in-progress
             ↑                  ↑
        completed turn    未完成的 turn
        中 JSONL 还没的    全部内容
```

和磁盘 JSONL 做对比——JSONL 已有的内容在重连回放时由磁盘历史承担，待刷新历史只补充磁盘快照中不存在的消息。实现上不是依赖 `result` 数量（Claude JSONL 不保证包含 `result`），而是读取磁盘 JSONL 快照生成消息 key 计数，然后对待刷新历史逐条消费去重。

**实时消息队列**：到达即 broadcast 给所有 subscriber，同时 push 进待刷新历史，为下次重连做准备。

### 重连回放消息序列

新 WebSocket 订阅者连接时的完整消息序列：

```
replay_start → 磁盘历史 JSONL → 待刷新历史 → replay_end → 实时消息队列
```

- WebSocket 连接建立后（`onopen`），服务端直接开始回放历史数据。`isRunning` 由消息流中的三态消息生命周期驱动。
- **`replay_start`** / **`replay_end`**：标记回放边界，客户端用于 batch apply（loading 态管理）
- **磁盘历史 JSONL**：逐行读文件发送，不占内存
- **待刷新历史**：buffer 回放，含 JSONL 缺失内容 + in-progress
- **实时消息队列**：`replay_end` 之后到达的数据

**当前状态**：第一版全量回放，不做分页裁剪。超大会话的分页优化待后续讨论后实现。

### 职责边界

- **待刷新历史 buffer**：relay 内存缓冲，负责重连时的即时状态恢复（system.init、model、permissionMode、最近消息）。只存 JSONL 尚未包含的 turn 内容，JSONL-like 语义。
- **REST /messages**：深分页加载旧消息，cursor-based，直接从磁盘 JSONL 读取
- **SessionMetadata**：持久化 model 和 permissionMode（供 REST API 在 system.init 到达前返回初始值，也供 `ensureRunning` 重建进程时传入 CLI）
- **CLI JSONL**：model 和 permissionMode 的权威历史存储（`--resume` 时 CLI 从中恢复）

---

## JSONL 与 CLI stdout 持久化边界

Claude CLI 有两套输出管道：**CLI stdout**（`--output-format stream-json`） 和 **JSONL 磁盘文件**（`~/.claude/projects/<dir>/<sessionId>.jsonl`）。二者的格式和包含的消息类型**不完全重叠**。

### CLI stdout 独有（JSONL 中不存在）

以下消息类型只在 CLI stdout 实时流中出现，**不会**写入 JSONL 磁盘文件。API 重启后 relay 从 JSONL 重建历史时，这些消息会丢失：

| 消息类型 | 生命周期 | Resume 影响 | 处理策略 |
|---|---|---|---|
| `system/init` | CLI 启动一次性 | **关键** | 持久化 `slash_commands`、`skills`、`tools` 到 SessionMetadata |
| `result` | 每 turn 结束一次 | **重要** | 用于清零 isRunning、flush assistant；JSONL 不含，需 buffer 补充 |
| `system/thinking_tokens` | 每 turn 实时 | 低 | turn 结束即无意义，不需要历史回放 |
| `system/api_retry` | 重试时临时 | 低 | 临时消息，重试结束即无意义 |
| `system/status` | compact 状态通知 | 低 | compact 结束即无意义 |
| `system/task_started` | 子任务开始 | 中等 | task 状态不持久化；可考虑从 JSONL 的 `task_started` 重建 |
| `system/task_updated` | 子任务更新 | 中等 | 同上 |
| `system/task_notification` | 子任务通知 | 低 | 一次性通知，不需要历史回放 |
| `system/microcompact_boundary` | 微压缩边界 | 低 | 可忽略 |
| `control_request` | 交互式权限提示 | 无 | 交互式实时消息，当前 turn 结束后即无意义 |
| `control_response` | 控制动作响应（`set_model` / `set_permission_mode` / `interrupt` 的 CLI 回执） | 无 | 交互式实时消息，CLI 进程内切换标量后回 |
| `system/permission_denied` | 自动权限拒绝 | 低 | 2026-06 新发现的类型，字段: `decision_reason`, `decision_reason_type`, `message`, `tool_name`, `tool_use_id` |

### JSONL 独有（CLI stdout 不输出）

以下类型只出现在 JSONL 磁盘文件中，CLI stdout **不会**输出。

注意：JSONL 中 `assistant`、`user`、`mode`、`system/compact_boundary` 等类型的**外层信封格式与 CLI stdout 不同**（JSONL 多了 `parentUuid`、`isSidechain`、`uuid`、`timestamp`、`sessionId`、`cwd`、`gitBranch` 等追踪字段），但核心消息体一致。这部分差异不影响 resume 恢复，详见 [JSONL 信封字段](#jsonl-信封字段)。

**Resume 关键类型**（可用于恢复会话状态）：

| 类型 | 含义 | Resume 恢复价值 |
|---|---|---|
| `attachment` (23 种子类型) | 运行时附件：MCP 指令、skill 列表、命令权限、模式变更等 | **核心** — 可完整重建 MCP servers、skills、slash command 权限、plan/auto 模式状态 |
| `last-prompt` | 上次用户 prompt 文本 | **高** — 可用作 UI 输入回显或 draft 恢复 |
| `user.permissionMode` | 每条 user 消息上的 permission mode 快照 | **高** — 恢复每个 turn 的 permission mode 上下文（153 条样本） |
| `permission-mode` | 权限模式变更独立事件 | 中 — 恢复 permission mode 显示（仅 7 条样本） |
| `mode` | CLI 运行时心跳（永远 `"normal"`） | **无** — 永远是 `"normal"`，不承载任何状态信息 |
| `queue-operation` | CLI 输入队列操作（含 `content` 入队内容） | 低 — 用于 debug |

---

#### `attachment` — 运行时附件（23 种子类型）

**含义**：`attachment` 是 CLI 运行时的非对话内容记录。它记录 MCP 服务器指令变更、skill 列表更新、命令权限、模式切换、文件编辑等运行时状态。**每条 attachment 都是对某个状态的增量更新**。

**字段**（外层信封）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"attachment"` | 消息类型 |
| `parentUuid` | string | 父消息 UUID |
| `isSidechain` | boolean | 是否为侧链（如子 agent） |
| `uuid` | string | 本条消息唯一标识 |
| `timestamp` | string (ISO 8601) | 产生时间 |
| `sessionId` | string | 会话 UUID |
| `attachment` | object | 附件内容，`type` 字段决定子类型 |
| `cwd` | string | 工作目录 |
| `gitBranch` | string | 当前 Git 分支 |
| `userType` | string | 来源类型（`"external"` / `"synthetic"`） |
| `entrypoint` | string | 入口（`"cli"` / `"sdk-ts"`） |
| `version` | string | CLI 版本号 |
| `slug` | string? | 可选 slug |

**时机**：每种 attachment 子类型在对应事件发生时写入 JSONL。attachment 只在 JSONL 中存在，CLI stdout **不输出**。

##### 核心子类型（Resume 相关）

**`mcp_instructions_delta`** — MCP 服务器指令变更

**含义**：当 MCP 服务器提供的 `instructions` 内容被添加到 system prompt 或更新时记录。这是**增量** — `addedNames` 和 `addedBlocks` 追加到当前已累积的指令集。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"mcp_instructions_delta"` | 子类型 |
| `attachment.addedNames` | string[] | 新增/更新的 MCP 服务器名 |
| `attachment.addedBlocks` | string[] | 新增/更新的指令块（Markdown 文本） |

**Resume 恢复**：从最近一条 `mcp_instructions_delta` 可重建 MCP 服务器指令状态。但注意这是增量更新，完整的恢复需要累积所有历史 delta。

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "mcp_instructions_delta",
    "addedNames": ["context7", "deepwiki"],
    "addedBlocks": ["## context7\nUse this server to fetch current documentation..."]
  },
  "uuid": "c6282445-7913-4e3b-a3eb-b7589a2a91c3",
  "sessionId": "dbcec945-e33a-428b-8a70-f17d59298257"
}
```

---

**`skill_listing`** — Skill 列表更新

**含义**：当已注册 skill 的完整列表被刷新时记录。`content` 包含所有当前 skill 的文本描述。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"skill_listing"` | 子类型 |
| `attachment.content` | string | Markdown 列表，每行一个 skill 名称 + 描述 |

**Resume 恢复**：从最近一条 `skill_listing` 可完整重建 session 当前的 skill 列表（名称 + 描述文本）。这比 `system.init` 里的 `skills` 数组更丰富 — 它包含完整描述。

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "skill_listing",
    "content": "- context7-mcp: This skill should be used when the user asks about libraries, frameworks, API references...\n- vercel-react-best-practices: React and Next.js performance optimization guidelines..."
  }
}
```

---

**`command_permissions`** — 命令权限记录

**含义**：记录 slash command 的权限工具列表。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"command_permissions"` | 子类型 |
| `attachment.allowedTools` | string[] | 允许的工具列表 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "command_permissions",
    "allowedTools": []
  }
}
```

---

**`invoked_skills`** — Skill 调用记录

**含义**：记录被调用的 skill，包含 skill 名称、路径和完整内容。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"invoked_skills"` | 子类型 |
| `attachment.skills` | object[] | 被调用的 skill 列表 |
| `attachment.skills[].name` | string | Skill 名称 |
| `attachment.skills[].path` | string | Skill 路径（`"bundled:..."` / 自定义路径） |
| `attachment.skills[].content` | string | Skill 完整指令内容 |

**Resume 恢复**：可恢复当前活跃的 skill 及其完整指令。

---

**`auto_mode`** / **`auto_mode_exit`** — 自动模式切换

**含义**：auto mode 的进入和退出事件。`auto_mode` 在 session 初始化阶段出现（51 次，全部 `entrypoint: "sdk-ts"`），表示 CLI 启动时自动进入 auto mode。`auto_mode_exit` 表示用户手动退出（仅 1 次，`entrypoint: "cli"`）。

**`auto_mode` 字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"auto_mode"` | 子类型 |
| `attachment.reminderType` | `"full"` \| absent | 是否带完整提醒文本 |

**`auto_mode_exit` 字段**：仅 `attachment.type: "auto_mode_exit"`，无额外字段。

**Resume 恢复**：最近一条 auto mode 相关 attachment 决定当前是否处于 auto mode。

示例（`auto_mode`）：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "auto_mode",
    "reminderType": "full"
  },
  "userType": "external",
  "entrypoint": "sdk-ts",
  "sessionId": "1840c4fe-...",
  "version": "2.1.142"
}
```

示例（`auto_mode_exit`）：
```json
{
  "type": "attachment",
  "attachment": { "type": "auto_mode_exit" },
  "userType": "external",
  "entrypoint": "cli",
  "sessionId": "7b43886a-...",
  "version": "2.1.142"
}
```

---

**`plan_mode`** / **`plan_mode_exit`** / **`plan_mode_reentry`** — Plan 模式生命周期

**含义**：记录 plan 模式的进入、退出和重新进入事件。`plan_mode`（进入）、`plan_mode_exit`（退出）和 `plan_mode_reentry`（重新进入）构成完整的 plan 模式状态机。

**统计**（跨 4 个数据源 4208 条 attachment）：`plan_mode` 25 次、`plan_mode_exit` 36 次、`plan_mode_reentry` 15 次。三种子类型均已确认存在。

**`plan_mode` 字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"plan_mode"` | 子类型 |
| `attachment.reminderType` | `"full"` \| absent | 是否带完整提醒文本 |
| `attachment.isSubAgent` | boolean | 是否由子 agent 触发 |
| `attachment.planFilePath` | string | Plan 文件绝对路径 |
| `attachment.planExists` | boolean | Plan 文件是否存在 |

**`plan_mode_exit` 字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"plan_mode_exit"` | 子类型 |
| `attachment.planFilePath` | string | Plan 文件绝对路径 |
| `attachment.planExists` | boolean | Plan 文件是否存在 |

**`plan_mode_reentry` 字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"plan_mode_reentry"` | 子类型 |
| `attachment.planFilePath` | string | Plan 文件绝对路径 |

**Resume 恢复**：最近一条 plan mode 相关 attachment 决定当前是否处于 plan mode 及 plan 文件路径。

示例（`plan_mode`）：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "plan_mode",
    "reminderType": "full",
    "isSubAgent": false,
    "planFilePath": "/home/deploy/.claude/plans/kind-pondering-lagoon.md",
    "planExists": false
  },
  "userType": "external",
  "entrypoint": "cli",
  "sessionId": "36a1a53f-...",
  "version": "2.1.142",
  "slug": "kind-pondering-lagoon"
}
```

示例（`plan_mode_exit`）：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "plan_mode_exit",
    "planFilePath": "/home/deploy/.claude/plans/lazy-dazzling-coral.md",
    "planExists": false
  },
  "userType": "external",
  "entrypoint": "cli",
  "sessionId": "7b43886a-...",
  "version": "2.1.142",
  "slug": "lazy-dazzling-coral"
}
```

示例（`plan_mode_reentry`）：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "plan_mode_reentry",
    "planFilePath": "/home/deploy/.claude/plans/kind-pondering-lagoon.md"
  },
  "userType": "external",
  "entrypoint": "cli",
  "sessionId": "36a1a53f-...",
  "version": "2.1.142",
  "slug": "kind-pondering-lagoon"
}
```

---

##### 任务与命令

**`task_reminder`** — 任务提醒

**含义**：当前任务列表的定期快照。`content` 为任务对象数组，`itemCount` 为任务总数。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"task_reminder"` | 子类型 |
| `attachment.content` | TaskInfo[] | 当前任务列表（每个任务包含 id、subject、status 等字段） |
| `attachment.itemCount` | number | 任务总数 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "task_reminder",
    "content": [],
    "itemCount": 0
  }
}
```

---

**`task_status`** — 子任务状态变更

**含义**：后台子 agent（local_agent / remote_agent）的状态更新。包含任务 ID、类型、描述、当前状态和输出文件路径。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"task_status"` | 子类型 |
| `attachment.taskId` | string | 任务 ID |
| `attachment.taskType` | string | 任务类型（`"local_agent"` / `"remote_agent"`） |
| `attachment.description` | string | 任务描述 |
| `attachment.status` | string | 当前状态（`"running"` 等） |
| `attachment.deltaSummary` | string \| null | 增量摘要 |
| `attachment.outputFilePath` | string | 输出文件路径 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "task_status",
    "taskId": "a59fd32663419d240",
    "taskType": "local_agent",
    "description": "Angle D — reuse audit",
    "status": "running",
    "deltaSummary": null,
    "outputFilePath": "/tmp/claude-1000/-home-deploy-workspace-lang-partner/.../tasks/a59fd32663419d240.output"
  }
}
```

---

**`queued_command`** — 排队命令

**含义**：记录用户通过斜杠命令或其他机制排队的命令。`commandMode` 决定命令的处理模式。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"queued_command"` | 子类型 |
| `attachment.prompt` | string | 命令/提示文本 |
| `attachment.commandMode` | string | 命令模式（`"prompt"` 等） |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "queued_command",
    "prompt": "完成本change之后，你需要汇报给我...",
    "commandMode": "prompt"
  }
}
```

---

##### 文件与编辑

**`file`** — 文件附件

**含义**：记录 CLI 读取或引用的文件内容。`content` 包含完整的文件数据和元信息。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"file"` | 子类型 |
| `attachment.filename` | string | 文件绝对路径 |
| `attachment.displayPath` | string | 相对显示路径 |
| `attachment.content` | object | 文件内容对象 |
| `attachment.content.type` | `"text"` | 内容类型 |
| `attachment.content.file.filePath` | string | 文件路径 |
| `attachment.content.file.content` | string | 文件完整内容 |
| `attachment.content.file.numLines` | number | 文件行数 |
| `attachment.content.file.startLine` | number | 起始行（1） |
| `attachment.content.file.totalLines` | number | 总行数 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "file",
    "filename": "/home/deploy/workspace/agents-remote/.workflow/versions/.../progress.md",
    "displayPath": ".workflow/versions/.../progress.md",
    "content": {
      "type": "text",
      "file": {
        "filePath": "/home/deploy/workspace/agents-remote/.workflow/versions/.../progress.md",
        "content": "# progress\n\n本文件记录...",
        "numLines": 51,
        "startLine": 1,
        "totalLines": 51
      }
    }
  }
}
```

---

**`edited_text_file`** — 编辑文本文件记录

**含义**：记录 CLI 编辑过的文本文件的内容片段。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"edited_text_file"` | 子类型 |
| `attachment.filename` | string | 文件绝对路径 |
| `attachment.snippet` | string | 文件内容片段 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "edited_text_file",
    "filename": "/home/deploy/workspace/agents-remote/.workflow/versions/.../capture-web.log",
    "snippet": "VITE v8.0.13  ready in 410 ms\n➜  Local:   http://127.0.0.1:44103/"
  }
}
```

---

**`compact_file_reference`** — Compact 后文件引用

**含义**：上下文压缩后保留的文件引用。只记录路径，不包含内容——内容已在压缩时被丢弃。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"compact_file_reference"` | 子类型 |
| `attachment.filename` | string | 文件绝对路径 |
| `attachment.displayPath` | string | 相对显示路径 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "compact_file_reference",
    "filename": "/home/deploy/workspace/agents-remote/web/src/routes/ProjectConsoleRoute.tsx",
    "displayPath": "web/src/routes/ProjectConsoleRoute.tsx"
  }
}
```

---

**`plan_file_reference`** — Plan 文件内容快照

**含义**：记录 plan 文件的完整内容快照，用于跨 compact 保留 plan 上下文。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"plan_file_reference"` | 子类型 |
| `attachment.planFilePath` | string | Plan 文件绝对路径 |
| `attachment.planContent` | string | Plan 文件完整内容 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "plan_file_reference",
    "planFilePath": "/home/deploy/.claude/plans/kind-pondering-lagoon.md",
    "planContent": "# Agent List: Full Simplification\n\n## Context\n..."
  }
}
```

---

##### Hook 事件

**`hook_success`** — Hook 执行成功

**含义**：记录 hook 脚本执行成功的结果，包括 stdout、stderr、退出码和执行耗时。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"hook_success"` | 子类型 |
| `attachment.hookName` | string | Hook 名称 |
| `attachment.hookEvent` | string | Hook 触发事件（`"SessionStart"` / `"Stop"` 等） |
| `attachment.toolUseID` | string | 关联的 tool_use ID |
| `attachment.command` | string | 执行的命令 |
| `attachment.stdout` | string | 标准输出 |
| `attachment.stderr` | string | 标准错误 |
| `attachment.exitCode` | number | 退出码 |
| `attachment.durationMs` | number | 执行耗时（毫秒） |
| `attachment.content`? | string | 可选附加内容 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "hook_success",
    "hookName": "SessionStart:compact",
    "hookEvent": "SessionStart",
    "toolUseID": "8d014227-...",
    "command": "bash ${CLAUDE_PROJECT_DIR}/scripts/handoff-restore.sh",
    "stdout": "=== LinguaPair Session Restore ===\n...",
    "stderr": "",
    "exitCode": 0,
    "durationMs": 104
  }
}
```

---

**`hook_non_blocking_error`** — Hook 非阻塞错误

**含义**：Hook 脚本以非零退出码结束（非阻塞，不会中断 CLI 执行）。记录错误详情供诊断。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"hook_non_blocking_error"` | 子类型 |
| `attachment.hookName` | string | Hook 名称 |
| `attachment.hookEvent` | string | Hook 触发事件 |
| `attachment.toolUseID` | string | 关联的 tool_use ID |
| `attachment.command` | string | 执行的命令 |
| `attachment.stdout` | string | 标准输出 |
| `attachment.stderr` | string | 标准错误（含错误描述） |
| `attachment.exitCode` | number | 退出码（非零） |
| `attachment.durationMs` | number | 执行耗时（毫秒） |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "hook_non_blocking_error",
    "hookName": "Stop",
    "hookEvent": "Stop",
    "toolUseID": "ac42bd14-...",
    "command": "那就继续吧...",
    "stdout": "",
    "stderr": "JSON validation failed",
    "exitCode": 1,
    "durationMs": 20177
  }
}
```

---

**`hook_additional_context`** — Hook 附加上下文

**含义**：Hook 执行后注入到会话的附加上下文数据。`content` 为字符串数组，每条为一段上下文文本。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"hook_additional_context"` | 子类型 |
| `attachment.content` | string[] | 上下文内容数组 |
| `attachment.hookName` | string | Hook 名称 |
| `attachment.hookEvent` | string | Hook 触发事件 |
| `attachment.toolUseID` | string | 关联的 tool_use ID |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "hook_additional_context",
    "content": [
      "Recovered handoff checkpoint from the previous session...\n\n## Big picture\n..."
    ],
    "hookName": "SessionStart",
    "hookEvent": "SessionStart",
    "toolUseID": "SessionStart"
  }
}
```

---

##### 运行环境

**`date_change`** — 日期变更通知

**含义**：当系统日期跨越 UTC 午夜时写入，通知 CLI 内部日期已更新。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"date_change"` | 子类型 |
| `attachment.newDate` | string | 新日期（`"YYYY-MM-DD"` 格式） |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "date_change",
    "newDate": "2026-05-29"
  }
}
```

---

**`opened_file_in_ide`** — IDE 打开文件

**含义**：记录用户在 IDE 中打开的文件。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"opened_file_in_ide"` | 子类型 |
| `attachment.filename` | string | 文件绝对路径 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "opened_file_in_ide",
    "filename": "/home/deploy/workspace/agents-remote/.workflow/versions/index.md"
  }
}
```

---

**`selected_lines_in_ide`** — IDE 选中行

**含义**：记录用户在 IDE 中选中的代码行及内容。`content` 为选中的文本片段。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"selected_lines_in_ide"` | 子类型 |
| `attachment.ideName` | string | IDE 名称（如 `"Visual Studio Code"`） |
| `attachment.filename` | string | 文件名 |
| `attachment.displayPath` | string | 显示路径 |
| `attachment.lineStart` | number | 选中起始行 |
| `attachment.lineEnd` | number | 选中结束行 |
| `attachment.content` | string | 选中内容文本 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "selected_lines_in_ide",
    "ideName": "Visual Studio Code",
    "filename": "Untitled-1",
    "displayPath": "Untitled-1",
    "lineStart": 0,
    "lineEnd": 3,
    "content": "新增两个需要优化的内容：1 终端打字的延迟..."
  }
}
```

---

**`diagnostics`** — IDE 诊断信息

**含义**：记录 IDE 的诊断信息（如 TypeScript 类型检查提示），包含文件 URI 和诊断条目列表。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"diagnostics"` | 子类型 |
| `attachment.files` | object[] | 诊断文件列表 |
| `attachment.files[].uri` | string | 文件 URI（`file://` 格式） |
| `attachment.files[].diagnostics` | object[] | 诊断条目列表 |
| `attachment.files[].diagnostics[].message` | string | 诊断消息 |
| `attachment.files[].diagnostics[].severity` | string | 严重级别（`"Hint"` 等） |
| `attachment.files[].diagnostics[].range` | object | 位置范围（含 `start`/`end` 的 `line` + `character`） |
| `attachment.files[].diagnostics[].source` | string | 来源（`"ts"` 等） |
| `attachment.files[].diagnostics[].code` | string | 错误/提示代码 |
| `attachment.isNew` | boolean | 是否为新的诊断结果 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "diagnostics",
    "files": [{
      "uri": "file:///home/deploy/workspace/agents-remote/web/src/routes/SessionDetailRoute.tsx",
      "diagnostics": [{
        "message": "\"FormEvent\"已弃用。",
        "severity": "Hint",
        "range": { "start": { "line": 1673, "character": 20 }, "end": { "line": 1673, "character": 46 } },
        "source": "ts",
        "code": "6385"
      }]
    }],
    "isNew": true
  }
}
```

---

**`goal_status`** — 目标状态

**含义**：记录 CLI 的当前目标/任务声明及其完成状态。`condition` 为目标描述文本，`met` 表示是否已达成，`sentinel` 标记是否为哨兵条目。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"goal_status"` | 子类型 |
| `attachment.met` | boolean | 目标是否已达成 |
| `attachment.sentinel` | boolean | 是否为哨兵目标 |
| `attachment.condition` | string | 目标描述文本 |

示例：
```json
{
  "type": "attachment",
  "attachment": {
    "type": "goal_status",
    "met": false,
    "sentinel": true,
    "condition": "使用step-change 技能来完成versions/index.md 中的所有change..."
  }
}
```

---

#### `mode` — CLI 运行时心跳（JSONL 独有）

**含义**：CLI 内部运行时心跳。从 111 条真实样本（11/53 session 文件）统计，`mode` 字段**永远为 `"normal"`**。它不是 permission mode 信号。

**出现规律**：仅在 11/53 session 中出现。一个 session（`db0970f6`）独占 75 条。出现在 turn 边界。

**Resume 恢复**：无价值 — `mode` 永远是 `"normal"`，不承载状态信息。

示例：
```json
{
  "parentUuid": "5c9edb2c-59c7-465f-812e-92d3321eb6ac",
  "isSidechain": false,
  "type": "mode",
  "mode": "normal",
  "uuid": "c51a1282-9c2d-47e4-bda7-5787fb13d877",
  "timestamp": "2026-06-02T11:28:19.419Z",
  "userType": "external",
  "entrypoint": "sdk-ts",
  "cwd": "/home/deploy/workspace/test",
  "sessionId": "e3ca9671-453e-4bb1-bce9-6764b189a1a2",
  "version": "2.1.160",
  "gitBranch": "HEAD"
}
```

---

#### `user.permissionMode` — 用户消息上的 permission mode 字段

**含义**：出现在 `type: "user"` 消息顶层的 `permissionMode` 字段，记录**本条用户消息发送时的权限模式**。与独立消息 `type: "permission-mode"` 不同——后者是模式变更的事件记录，前者是每条用户消息上的快照字段。

**字段**（在 `type: "user"` 消息顶层）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `permissionMode` | `"auto"` \| `"default"` \| `"acceptEdits"` \| `"plan"` \| `"bypassPermissions"` | 本条用户消息发送时的权限模式 |

**统计**（workspace-test, 53 sessions）：`auto`（137）、`default`（12）、`acceptEdits`（4）。总计 153 条。

**出现位置**：仅在 JSONL 磁盘文件中。CLI stdout 的 `type: "user"` 消息不包含此字段。

示例：
```json
{
  "parentUuid": null,
  "isSidechain": false,
  "type": "user",
  "message": { "role": "user", "content": [{ "type": "text", "text": "say hi in one word" }] },
  "permissionMode": "auto",
  "uuid": "2341945a-...",
  "timestamp": "2026-06-02T16:11:04.421Z",
  "sessionId": "11d4f550-...",
  "userType": "external",
  "entrypoint": "sdk-ts",
  "cwd": "/home/deploy/workspace/test",
  "version": "2.1.160"
}
```

**处理方法**：

1. 在历史回放中可用于恢复每个 turn 的 permission mode 上下文
2. `permissionMode` 可能在同一 session 的多个 turn 间不同（用户可通过 `/permission-mode` 切换）
3. 与 `type: "permission-mode"` 独立消息不同——后者是 mode 变更事件记录，可能不存在（一个 session 可以多次 mode 切换但 zero `permission-mode` 独立消息）

---

#### `permission-mode` — 权限模式变更事件

**含义**：用户通过 `/permission-mode` 或 UI 切换权限模式时记录的**独立事件**。与 `user.permissionMode` 字段不同——后者是每条 `type: "user"` 消息上的快照字段，前者是独立的变更事件记录。

**重要发现**：同一 session 内 `permissionMode` 可以在多个 turn 间切换（通过 `user.permissionMode` 字段观察），但**不一定产生对应的 `permission-mode` 独立消息**。例如 session `db0970f6` 有 3 种不同的 `permissionMode` 值（`auto`/`default`/`acceptEdits`）但 zero 条 `type: "permission-mode"` 独立消息。推断 `type: "permission-mode"` 仅当用户通过命令行显式切换时写入，SDK 侧或 resume 携带的模式变更不生成此消息。

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"permission-mode"` | 消息类型 |
| `permissionMode` | `"auto"` \| `"default"` \| `"acceptEdits"` \| `"plan"` \| `"bypassPermissions"` | 权限模式 |
| `sessionId` | string | 会话 UUID |

**统计**（workspace-test, 53 sessions）：仅 7 条，分布在 4 个 session 中。值分布：`auto`（4）、`default`（3）。agents-remote 自有 sessions 中大量出现（7228+ 条，含 `bypassPermissions` 和 `plan`）。

**时机**：用户通过 CLI 显式切换权限模式时写入。不是所有 mode 变更都会产生此消息。

**Resume 恢复**：中等优先级。`user.permissionMode` 字段是恢复每个 turn permission mode 上下文的更可靠来源（153 条 vs 7 条）。

示例：
```json
{
  "parentUuid": "5c9edb2c-59c7-465f-812e-92d3321eb6ac",
  "isSidechain": false,
  "type": "permission-mode",
  "permissionMode": "auto",
  "uuid": "cbd49229-38d0-4c95-8ef6-5e751147104f",
  "timestamp": "2026-06-02T11:28:19.422Z",
  "sessionId": "8ac6ff40-ea16-4666-a973-ea00c78c2af1",
  "version": "2.1.160"
}
```

---

#### `queue-operation` — CLI 输入队列操作

**含义**：CLI 输入端 FIFO 队列的入队/出队记录。所有进入 CLI 处理管道的内容（用户输入、斜杠命令、后台 task-notification 自动注入）都经过此队列。**不是** subagent 调度队列。

**公共字段**：

`type` (`"queue-operation"`) · `operation` (`"enqueue"` / `"dequeue"` / `"remove"` / `"popAll"`) · `timestamp` (ISO 8601) · `sessionId` (UUID)

**`content` 字段按 operation 区分**：

| operation | content | 说明 |
|---|---|---|
| `enqueue` | 可选 | 带时为入队内容；不带时无法从消息得知入队了什么 |
| `dequeue` | **从不携带** | 仅表示"取走队首开始处理" |
| `remove` | **从不携带** | pop 队尾——撤销最近入队的那条（见下方语义） |
| `popAll` | 必带 | 记录被弹出的内容（通常是被丢弃的用户消息） |

**操作语义（FIFO + LIFO 混合队列）**：

| operation | 队列操作 | 触发方 | 间隔特征 |
|---|---|---|---|
| `enqueue` | push 队尾（尾部追加） | user / assistant | — |
| `dequeue` | shift 队首（FIFO，取最旧的） | CLI 拉取处理 | 与对应 `enqueue` 间隔 < 1ms |
| **`remove`** | **pop 队尾（LIFO，撤销最近入队的）** | **user 改变主意** | 与对应 `enqueue` 间隔数秒~数十秒 |
| `popAll` | clear 全部 | user | content 记录被丢弃的内容 |

> 💡 **`dequeue` vs `remove` 的区别**：两者都从队列移除条目，但方向和触发方不同。`dequeue` 是 CLI 从队首 FIFO 拉取（正常处理流），`remove` 是用户从队尾 LIFO 撤回最近一次尚未被处理的输入（改主意取消）。这就是为什么需要两个独立 operation——职责不重叠。
>
> 行为证据：`enqueue`→`dequeue` 总是 < 1ms 配对（CLI 立即取走）；`enqueue`→`remove` 则相隔数秒到数十秒（用户思考后撤回），且 `remove` 前无夹带 `dequeue`。

**content 的两个来源（使用中归纳，非消息字段）**：

区分规则：XML 格式 → `assistant`，其余一切 → `user`。

| 来源 | 判断条件 | 说明 |
|---|---|---|
| **assistant** | 内容为 XML 格式（`<...>...</...>`） | CLI 自动注入到自身队列的结构化数据（`<task-notification>` 等） |
| **user** | 其余一切 | 斜杠命令（`/model`、`/resume`）、用户文本消息 |

content 本身**不带** source 字段。

**与 `<task-notification>` 的关系**：后台 subagent 完成后，CLI 自动将 `<task-notification>` enqueue 到自身输入队列，然后 dequeue 处理并展示。`task_notification` 是事件本身，`queue-operation` 是它的运输记录。

**时机**：有内容进入 CLI 输入管道时写入。用户输入时成对出现（`enqueue` → `dequeue`，间隔通常 < 1ms）。后台 task-notification 注入时同样成对出现。

**Resume 恢复**：一般不需要。仅用于 debug 输入管道时序。注意 `enqueue` content 可选时回放无法得知入队内容。

**`enqueue` 示例（带 content，斜杠命令）**：
```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-06-14T16:01:38.237Z",
  "sessionId": "74337bd9-a02a-4db3-a888-43c14987dd36",
  "content": "/model opusplan"
}
```

**`enqueue` 示例（带 content，task-notification 注入）**：
```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-06-10T18:15:30.466Z",
  "sessionId": "74337bd9-a02a-4db3-a888-43c14987dd36",
  "content": "<task-notification>\n<task-id>a122c801a46ab5746</task-id>\n<tool-use-id>call_03_bVTcgN1qLQLkHuVtsZgo6322</tool-use-id>\n<output-file>/tmp/claude-1000/-home-deploy-workspace-lang-partner/...</output-file>\n</task-notification>"
}
```

**`dequeue` 示例（无 content）**：
```json
{
  "type": "queue-operation",
  "operation": "dequeue",
  "timestamp": "2026-06-02T13:34:33.532Z",
  "sessionId": "3683d2a4-86bf-42b6-b243-e0bea3087b01"
}
```

**`remove` 示例（无 content、无标识）**：
```json
{
  "type": "queue-operation",
  "operation": "remove",
  "timestamp": "2026-06-08T05:35:44.250Z",
  "sessionId": "a223b434-9649-4468-a5cf-277507ff7c03"
}
```

**`popAll` 示例（带 content，记录被弹出的用户消息）**：
```json
{
  "type": "queue-operation",
  "operation": "popAll",
  "timestamp": "2026-06-07T07:11:20.937Z",
  "sessionId": "bb968e20-67b1-4106-b84f-02a3c48b8712",
  "content": "下一条规则。数据可以划分为通用数..."
}
```

---

#### 标题类消息

| 类型 | 字段 | 含义 | 时机 |
|---|---|---|---|
| `ai-title` | `aiTitle` (string), `sessionId` | 会话活动/话题的描述性标题（自由文本，"做什么事"） | AI 生成；会话中随话题变化重写 |
| `agent-name` | `agentName` (string), `sessionId` | 当前 agent/workflow 身份标识（slug，"我是谁"）；纯状态，非对话事件 | agent/workflow 身份设定或切换时；与 ai-title 独立，可分歧 |
| `custom-title` | `customTitle` (string), `sessionId` | 用户自定义标题 | 用户执行重命名 |

---

#### `ai-title` / `agent-name` — 标题 vs 身份

**含义**：两者都是自描述的 session 元数据（`sessionId` 恒等于宿主文件自身 id），但语义角色不同，**不等价**：

- **`ai-title` = 做什么事** —— 会话活动/话题的描述性标题，自由文本（如 `"Review workflow skills outline"`、`"创建中英语言交换网站"`）。
- **`agent-name` = 我是谁** —— 当前运行的 agent/workflow 身份标识，slug 风格（如 `"refactor-workflow"`、`"tmux-process-persistence"`）。**纯状态，非对话事件。**

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"ai-title"` / `"agent-name"` | 顶层消息类型 |
| `aiTitle` / `agentName` | string | 标题文本 / 身份 slug |
| `sessionId` | string | 恒等于宿主 session 自身 id（自引用，非指向其他 agent） |

**高频重复**：每个 checkpoint 都重写当前值，同一值会重复几十到数百次（一个 7263 行的普通 session 有 476 条 ai-title，唯一值仅 1）。唯一有信息量的是**值改变**的时刻。

**出现规律**：

- 普通用户会话：只有 `ai-title`（唯一值通常 = 1），**没有 `agent-name`**。
- 编排/多任务会话：两者都有，随任务切换变化；workflow 场景下 change-id slug 常同时成为标题与身份 → 此时两者恰好相等。

**两者不等价的证据**（避免从单文件相等误判为冗余）：

```
文件 821781dd:  ai-title='Review workflow skills outline'   agent-name='refactor-workflow'
文件 b92cc42b:  末尾 agent-name 独立于 ai-title 漂移（倒退回旧任务名后再追上）
```

跨 9 个含 agent-name 的 session 文件，2 个存在分歧；不能用单文件巧合下全称结论。

**示例**：

```json
{ "type": "ai-title", "aiTitle": "Add delete project feature", "sessionId": "b92cc42b-..." }
{ "type": "agent-name", "agentName": "refactor-workflow", "sessionId": "821781dd-..." }
```

**Resume / 渲染含义**：

- `agent-name` 是纯状态（身份标识）→ 适合做持久 badge/header，不应作为对话气泡逐条渲染。
- `ai-title` 描述活动，值变化时可呈现（如"会话主题切换"）。

---

#### `file-history-snapshot` — 文件历史快照

**含义**：CLI 的文件追踪系统快照。`trackedFileBackups` 记录被追踪文件的备份信息。JSONL-only 顶层类型。

**字段**（从实机 JSONL 提取）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"file-history-snapshot"` | 顶层消息类型 |
| `messageId` | string | 关联的 message UUID |
| `snapshot` | object | 快照数据：`{ messageId, trackedFileBackups, timestamp }` |
| `snapshot.trackedFileBackups` | object | 被追踪文件的备份信息（key 为文件路径） |
| `snapshot.timestamp` | string (ISO 8601) | 快照时间 |
| `isSnapshotUpdate` | boolean | 是否为增量更新 |

**Resume 恢复**：低优先级。仅用于恢复文件编辑历史。

---

#### `system/away_summary` — 离开状态摘要

**含义**：当 CLI 在 auto mode 或持续任务中生成阶段性摘要时记录。

**关键字段**：`subtype: "away_summary"`, `content` (string), `slug` (string), `isMeta` (boolean)

**Resume 恢复**：低。`content` 包含任务进度文本，可用于恢复上下文感知。

---

#### `system/informational` — 信息性通知

**含义**：CLI 内部信息性通知（如 hook 阻塞警告）。

**关键字段**：`subtype: "informational"`, `content` (string), `level` (string)

---

#### `system/local_command` — 本地命令执行

**含义**：用户执行本地命令（如 `/clear`、`/compact`、`/config`）的记录。`content` 使用 XML 包裹 CLI TUI 输出。**该类型主要出现在 JSONL 持久化中**：实时 stdout 通常用 `assistant` + `model: "<synthetic>"` 发送命令输出，而 JSONL 回放时同一输出被保存为 `system/local_command` + `<local-command-stdout>`。前端 `normalizeChatStream` 把它识别为 `command-output` 片段，与相邻的 `user` 命令输入标签合并成一张卡片。

**字段**（从实机 JSONL 提取）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"system"` | 消息类型 |
| `subtype` | `"local_command"` | 本地命令 |
| `content` | string | XML 格式输出，包含 `<command-name>`, `<command-message>`, `<command-args>`, `<local-command-stdout>` 等标签 |
| `level` | `"info"` | 日志级别 |
| `isMeta` | boolean | 通常为 `false` |
| `parentUuid` | string | 父消息 UUID |
| `timestamp` | string (ISO 8601) | 时间戳 |
| `uuid` | string | 消息 UUID |
| `sessionId` | string | 会话 UUID |

示例：
```json
{
  "type": "system",
  "subtype": "local_command",
  "content": "<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>",
  "level": "info",
  "isMeta": false,
  "sessionId": "f4dd7cbe-4f02-4154-8126-e7c01ad22ef2"
}
```

---

#### `system/stop_hook_summary` — Stop Hook 执行摘要

**含义**：Stop hook 执行完成后写入，记录 hook 执行次数、错误、是否阻止了 turn 结束等。

**关键字段**：`subtype: "stop_hook_summary"`, `hookCount` (number), `hookInfos` (array), `hookErrors` (array), `stopReason` (string), `preventedContinuation` (boolean), `hasOutput` (boolean), `toolUseID` (string)

---

### 两处共存但信封格式不同

以下类型同时在 JSONL 和 CLI stdout 中出现，**但 JSONL 外层信封更丰富**：

| 类型 | JSONL 独有信封字段 | 核心消息体 |
|---|---|---|
| `assistant` | `parentUuid`, `isSidechain`, `uuid`, `timestamp`, `sessionId`, `cwd`, `gitBranch`, `userType`, `entrypoint`, `version`, `slug`, `isApiErrorMessage?`, `error?` | `message` (id, role, content, model, usage) |
| `user` | `parentUuid`, `isSidechain`, `promptId`, `uuid`, `timestamp`, `permissionMode`, `userType`, `entrypoint`, `cwd`, `sessionId`, `gitBranch`, `version`, `slug` | `message` (role, content) |
| `system/compact_boundary` | `content` (human-readable), `isMeta`, `level`, `logicalParentUuid`, `timestamp`, `slug`, `cwd`, `gitBranch` | `compactMetadata` (trigger, preTokens, durationMs 等) |
| `system/turn_duration` | `isMeta`, `timestamp`, `uuid`, `userType`, `entrypoint`, `cwd`, `gitBranch`, `version` | `durationMs`, `messageCount` |
| `system/api_error` | `isSidechain`, `level`, `maxRetries`, `retryAttempt`, `retryInMs`, `timestamp`, `uuid`, `userType`, `entrypoint`, `cwd`, `gitBranch`, `version`, `slug` | `error` (message, status 等) |
| `mode` | 格式一致（`mode`, `sessionId`） | 两端相同 |

**信封差异的本质**：JSONL 是持久化日志，需要完整的追溯信息（时间戳、分支、入口、版本等）。CLI stdout 是实时管道，只传当前处理所需的字段。

### JSONL 信封字段

几乎所有 JSONL 消息共享一套外层信封字段，用于追溯。这些字段在 resume 时用于关联和过滤。

**`uuid` 作为持久化分类标记**：有 `uuid` 的消息是对话树的持久节点（写入 JSONL）；无 `uuid` 的消息是瞬时信号（仅 stdout，不写入 JSONL）。`mode` 是「无 `uuid` 但写入 JSONL」的唯一例外；反方向「有 `uuid` 但不写入 JSONL」的例外是 `system.init` 与 `result`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `uuid` | string | 消息唯一标识 |
| `sessionId` | string | 会话 UUID |
| `parentUuid` | string \| null | 父消息 UUID（构建消息树） |
| `isSidechain` | boolean | 是否为侧链消息（如子 agent） |
| `timestamp` | string (ISO 8601) | 消息时间戳 |
| `cwd` | string | 当前工作目录 |
| `gitBranch` | string | 当前 Git 分支 |
| `userType` | `"external"` \| `"synthetic"` | 来源 |
| `entrypoint` | `"cli"` \| `"sdk-ts"` | 入口类型 |
| `version` | string | CLI 版本号 |
| `slug` | string? | 可选标识 |

### Resume 恢复策略总结

API 重启或 WebSocket 重连后，应根据 JSONL 中的最后一条状态消息重建以下客户端状态：

| 状态 | 消息来源 | 恢复方法 |
|---|---|---|
| Model | `SessionMetadata.model` | 已持久化，从 metadata 文件恢复 |
| Permission Mode | `SessionMetadata.permissionMode` / JSONL `permission-mode` / `user.permissionMode` | 已持久化 + JSONL 补充. `user.permissionMode` 是 per-turn 快照（153 条），比独立 `permission-mode` 事件（7 条）更可靠 |
| Slash Commands | `system/init` → 持久化到 `SessionMetadata.slashCommands` | **待实现** |
| Skills | `system/init` → 持久化到 `SessionMetadata.skills` / JSONL `attachment.skill_listing` 补充 | **待实现** |
| MCP Servers | JSONL `attachment.mcp_instructions_delta` | 可选实现 |
| Plan Mode State | JSONL `attachment.plan_mode` / `plan_mode_exit` | 可选实现 |
| Auto Mode State | JSONL `attachment.auto_mode` / `auto_mode_exit` | 可选实现 |

### API 重启后的数据丢失

API 进程重启后，relay 从 JSONL 重建历史快照。内存 buffer 因为仅在内存中也会清空。**按 `uuid` 分类**：有 `uuid` 的消息已持久化到 JSONL，可从文件恢复；无 `uuid` 的瞬时信号只存在于 stdout，重启后从 WebSocket 回放中**永久消失**。

已知的无 `uuid` 瞬时信号（重启后丢失）：

| 消息 | 丢失后果 | 严重程度 |
|---|---|---|
| `system/init` | `slash_commands`、`skills`、`tools`、`agents`、`plugins`、`mcp_servers`、`cwd` 等一次性启动参数 | **高** — 客户端 UI 元数据缺失 |
| `result` | 最近一个 turn 的结束标记 | 中 — `isRunning` 可能误判 |
| `system/task_started/updated/notification` | 活跃 task 的状态 | 中 — task 列表不完整 |
| `system/thinking_tokens` | 当前 turn 的实时 token 计数 | 低 — turn 完成后无意义 |
| `control_request` | 权限请求状态 | 低 — 瞬时交互，重启后无需恢复 |
| `system/status` / `api_retry` / `permission_denied` | 运行时通知 | 低 — 瞬时事件 |

**修复原则**：

- `system/init` 的关键字段（`slash_commands`, `skills`）在 `captureSystemInitFromLine` 中捕获并通过 `onSystemInit` 回调持久化到 SessionMetadata
- `buildBootstrapPlan` 检查 relay+buffer 快照中是否存在 `system/init`，若不存在则从 SessionMetadata 合成一条注入
- `model` 和 `permissionMode` 已持久化，无需额外处理
