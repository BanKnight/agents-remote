# Claude CLI stream-json 协议

本文档沉淀 Claude CLI (`claude`) 的 stdio stream-json 协议——它是 Agent Runtime 与 CLI 进程之间的通信契约，也是 model、permissionMode 等会话状态的唯一权威来源。

**目标读者**：需要实现兼容前端的开发者。读完本文档即可独立做出功能等价的前端。

## 概述

Claude CLI 通过 stdin/stdout 以 JSONL（每行一个 JSON）方式通信。消息类型分三类：

- **CLI stdout 实时流**：`system.*` / `assistant` / `user` / `result` / `control_request` / `mode` / `switch_model_result`
- **CLI stdin 输入**：`user` / `control_response` / `control_request` (interrupt) / `switch_model` / `permission_mode`
- **JSONL 磁盘文件独有**：`attachment` / `last-prompt` / `ai-title` / `agent-name` / `permission-mode` / `mode` / `file-history-snapshot` / `queue-operation` / `custom-title`

其中 `system.*` 目前已知包含 `system.init`、`system.status`、`system.compact_boundary` / `system.microcompact_boundary`、`system.api_retry`、`system.api_error`、`system.turn_duration`、`system.thinking_tokens`、`system.task_started` / `system.task_updated` / `system.task_notification`、`system.local_command`，以及运行时控制信号（`permission_denied`）。JSONL 独有类型是独立的顶层类型（如 `type: "attachment"`），**不是** `system` 子类型。

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
| `system` | `status` | compact 运行态通知 | 否 | 是 | 是 |
| `system` | `compact_boundary` | 上下文压缩边界 | 是 | 是 | 是 |
| `system` | `microcompact_boundary` | 微压缩边界 | 否 | 是 | 是 |
| `system` | `api_retry` | API 重试通知 | 否 | 是 | 是 |
| `system` | `api_error` | API 错误通知 | 是 | 是 | 是 |
| `system` | `thinking_tokens` | 推理 token 增量 | 否 | 是 | 是 |
| `system` | `task_started` | 子任务开始 | 否 | 是 | 是 |
| `system` | `task_updated` | 子任务状态更新 | 否 | 是 | 是 |
| `system` | `task_notification` | 子任务通知 / 完成 | 否 | 是 | 是 |
| `system` | `permission_denied` | 自动权限拒绝 | 否 | 是 | 是 |
| `system` | `turn_duration` | turn 耗时统计 | 是 | 是 | 是 |
| `assistant` | 见下方 [assistant content 子类型](#assistant-messagecontent-子类型) | AI 回复流 | 是 | 是 | 是 |
| `user` | 见下方 [user 消息变体](#user-消息变体) | 用户输入 / 工具结果 / CLI 内部消息 | 是 | 是 | 是 |
| `result` | `success` / `error` / `interrupted` / `error_max_turns` | turn 结束 | 否 | 是 | 是 |
| `control_request` | `can_use_tool` | 权限请求（Bash, Write, AskUserQuestion 等） | 否 | 是 | 是 |
| `switch_model_result` | 成功 / 失败 | 模型切换确认 | 否 | 是 | 是 |
| `mode` | `"auto"` / `"default"` / `"plan"` / `"normal"` | 运行时模式切换（顶层类型，非 system 子类型） | 是 | 是 | 是 |

### CLI stdin（外部 → CLI）

| 类型 | 含义 | 写入 JSONL | 新会话 | resume 会话 |
|---|---|---|---|---|
| `user` | 用户文本输入 | 是（处理后） | 是 | 是 |
| `control_response` | 权限响应（allow / deny） | 否 | 是 | 是 |
| `control_request` | 中断请求（`subtype: "interrupt"`） | 否 | 是 | 是 |
| `switch_model` | 请求切换模型 | 否 | 是 | 是 |
| `permission_mode` | 请求切换权限模式 | 否 | 是 | 是 |

### JSONL 独有顶层类型

以下类型**不出现在 CLI stdout**，仅写入磁盘 JSONL 文件。它们的 `type` 是顶层字段，**不是** `system` 子类型。

| 类型 | 含义 | 关键字段 | Resume 恢复价值 |
|---|---|---|---|
| `attachment` | 运行时附件（MCP 指令、skill 列表、模式变更等 15+ 子类型） | `attachment.type`, `attachment.*` | **核心** — 可重建 MCP servers、skills、plan/auto 模式状态 |
| `last-prompt` | 上次用户 prompt 文本 | `lastPrompt`, `leafUuid` | **高** — 可用作 UI 输入回显或 draft 恢复 |
| `ai-title` | AI 生成会话标题 | `aiTitle` | 中 — 会话列表摘要 |
| `agent-name` | Agent/subagent 名称 | `agentName` | 低 — 识别活跃 agent |
| `permission-mode` | 权限模式变更 | `permissionMode` | 中 — 恢复 permission mode 显示 |
| `mode` | 运行时模式（也出现在 stdout） | `mode` | 中 — 恢复 `normal` / `auto` 等 mode 显示 |
| `file-history-snapshot` | 文件追踪系统快照 | `messageId`, `snapshot`, `isSnapshotUpdate` | 低 — 恢复文件编辑历史 |
| `queue-operation` | 任务队列操作（入队/出队/移除/清空） | `operation`, `content?` | 低 — 调试任务调度 |
| `custom-title` | 用户自定义标题 | `customTitle` | 低 — 会话重命名记录 |

### 顶层辅助字段

这些字段不是独立消息类型，但在协议里同样需要明确含义。

| 字段                                | 含义                          | 用途                                     |
| ----------------------------------- | ----------------------------- | ---------------------------------------- |
| `uuid`                              | 消息唯一标识                  | replay / reconnect 的尾部补齐依据        |
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

#### `system` / `status` — compact 状态变更

**含义**：上下文压缩（compact）的生命周期通知。CLI 在压缩开始时发送 `status: "compacting"`，完成时发送 `compact_result`。

**字段**：

| 字段             | 类型                      | 说明                |
| ---------------- | ------------------------- | ------------------- |
| `type`           | `"system"`                | 消息类型            |
| `subtype`        | `"status"`                | 状态通知            |
| `status`         | `"compacting"` \| `null`  | 压缩进行中 / 已结束 |
| `compact_result` | `"success"` \| `"failed"` | 压缩结果（完成时）  |
| `compact_error`  | string?                   | 失败原因（失败时）  |
| `session_id`     | string                    | 会话 UUID           |

```json
// compact 开始
{ "type": "system", "subtype": "status", "status": "compacting", "session_id": "..." }

// compact 完成
{ "type": "system", "subtype": "status", "status": null, "compact_result": "success", "session_id": "..." }
```

**处理方法**：

1. `status: "compacting"` → 设置 `isRunning = true`，显示 compact 进度指示器
2. `compact_result: "success"` → 隐藏进度指示器，进入 replay 阶段
3. `compact_result: "failed"` → 显示失败信息，`compact_error` 说明原因
4. 需配合 `compact_boundary` 消息实现完整的 compact 阶段跟踪（见下方生命周期章节）

---

#### `system` / `compact_boundary` / `microcompact_boundary` — 上下文压缩标记

**含义**：CLI 持久化到 JSONL 的压缩记录（`isMeta: false`）。表示在此之前的上下文已被压缩，后续消息在一个精简后的上下文中继续。

**字段**：

| 字段                                       | 类型                                              | 说明                  |
| ------------------------------------------ | ------------------------------------------------- | --------------------- |
| `type`                                     | `"system"`                                        | 消息类型              |
| `subtype`                                  | `"compact_boundary"` \| `"microcompact_boundary"` | 压缩类型              |
| `compactMetadata` / `microcompactMetadata` | object                                            | 压缩元数据            |
| `compactMetadata.trigger`                  | `"auto"` \| `"manual"`                            | 触发方式              |
| `compactMetadata.preTokens`                | number                                            | 压缩前 token 数       |
| `microcompactMetadata.tokensSaved`         | number                                            | 微压缩节省的 token 数 |

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "compactMetadata": { "trigger": "auto", "preTokens": 123456 }
}
```

**处理方法**：

1. 将当前正在积累的 assistant bubble 刷出
2. 以 `role: "system"` 在消息流中渲染压缩分割线，显示压缩类型（手动/自动）和压缩前 token 数
3. 手动压缩显示「上下文已压缩 (~120k tokens)」，自动压缩显示「上下文自动压缩 (~120k tokens)」
4. 这是持久化消息——重连时也会重放

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

1. 以 `role: "system"` 的 **inline 错误消息**渲染在消息流中，出现在请求失败的当时位置
2. 消息文本示例：`API 请求失败2/3：Overloaded，2s 后重试`
3. 使用 `metadata: { custom: { systemMessageType: "error" } }` 标记，前端可据此应用红色/琥珀色样式
4. **不要**渲染为固定横幅——它属于消息流中的事件，出现在 API 调用失败的上下文位置
5. 不表示最终失败（最终失败由 `result` 的 `is_error: true` 表达）；如果重试成功，后续 assistant 消息会自然覆盖

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

**含义**：CLI 在每轮对话开始时，记录当前用户输入的原始文本。是恢复用户界面上"上次输入"的最直接来源。

**字段**（从实机 JSONL 提取）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"last-prompt"` | 顶层消息类型 |
| `lastPrompt` | string | 用户最后一次输入的原始文本 |
| `leafUuid` | string | 关联的用户消息 UUID |
| `sessionId` | string | 会话 UUID |

**处理方法**：

1. 不渲染到聊天流——用户输入已有 `user` 消息承载
2. 可用于恢复输入框 draft 或显示"上次对话"摘要
3. 与 `system/last_prompt`（stdout 中的完整组装 prompt 回显，含 system prompt + 工具定义）不同——`last-prompt` 只记录用户原文

---

#### `mode` — 运行时模式切换

**含义**：CLI 在 session 运行过程中切换模式（如 compact 前后、auto mode 变更）时发送。是一种顶层消息类型（`type: "mode"`），不是 `system` 子类型。

**字段**（从 CLI 实机行为提取）：

| 字段         | 类型                                       | 说明         |
| ------------ | ------------------------------------------ | ------------ |
| `type`       | `"mode"`                                   | 顶层消息类型 |
| `mode`       | `"auto"` \| `"default"` \| `"plan"` \| ... | 当前运行模式 |
| `session_id` | string                                     | 会话 UUID    |

**处理方法**：

1. 更新客户端 permissionMode UI 指示器
2. 属于运行时状态信号，不作为聊天消息渲染

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
   - 通过 `broadcast` 原样推送给客户端
   - 更新当前 turn 共享的 `turnTokens` ref
   - 驱动 Thinking 面板上的实时 token 计数（如 `Thinking… (39 tokens)`）
3. 在 relay buffer / 历史回放中：
   - 连续的 `thinking_tokens` 折叠为最后一条
   - 回放时不展示中间动画，但最终 token 总数仍要 attach 到 reasoning part
4. 真正的 thinking 文本内容仍然来自 assistant `content` 中的 `{ type: "thinking", thinking: "...", signature: "..." }`
5. `thinking_tokens` 本身不生成新的 UI part；它只是为同 turn 的 reasoning part 提供 token metadata

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
4. **不要**用 `TaskCreate` / `TaskUpdate` 等普通工具的 `toolUseResult` 去重建顶部 task 小条——那是聊天内容里的工具结果，不是 runtime task telemetry

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

1. 当前实现不单独渲染该消息；真正可见的错误内容来自后续 `user.tool_result(is_error=true)`
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

处理规则（`loadMessagesFromRaw`，实时流和回放统一）：

1. 消息 1 的 `tool_use` → 创建 tool-call part（`toolCallId = block.id`）
2. 消息 2 的 `tool_result` → 通过 `tool_use_id` 匹配 tool-call part，设置 `result` 字段；如果该 tool-call 已在前一个 assistant 气泡里被 flush，前端会向后回溯并更新已渲染的 bubble；如果中间又插入了新的 assistant 文本气泡，这个回溯仍然会沿着已渲染的 assistant 历史继续向前找目标 tool-call
3. 消息 3（`isMeta: true`）→ 通过 `sourceToolUseID` 匹配 tool-call part，设置 `metadata.skillContent`；**跳过用户气泡渲染**（`continue`）
4. 无 `sourceToolUseID` 的 `isMeta` 消息（如 "Continue from where you left off"）→ **仅跳过气泡**，不附加任何内容

**注意**：消息 2（tool_result）不触发 `flushAssistant()`——它的 content 只有 `tool_result` 块，无 `text` 块，`userTexts` 为空。因此消息 3 到达时 tool-call 仍在 `currentParts` 中，可以直接匹配。若 tool-call 已经因为后续 assistant 消息被 flush，则前端需要回溯更新先前渲染的 assistant bubble。

**relay 行为**：relay 不做任何过滤。`isMeta` 消息在 live broadcast 和 pending buffer/JSONL replay 两条路径上**完全一致**地传输。`isChatMessage` 不排斥 `isMeta`——rendering 决策统一在前端 `loadMessagesFromRaw` 中完成。

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

`tool_result.content` 可以是字符串（简单文本结果）或数组（`[{ type: "text", text: "..." }]`）。

**字符串形式**（CLI 内部命令输出）。`message.content` 为字符串时，有四种模式：

| 模式 | 出现次数 | 示例 | 处理方式 |
|---|---|---|---|
| 纯文本用户输入 | 93 | `"我们之前做了一次优化..."` | 渲染为用户对话气泡 |
| `<local-command-caveat>` | 4 | `<local-command-caveat>Caveat: The messages below...</local-command-caveat>` | 跳过（CLI 内部指令说明） |
| `<command-name>` | 4 | `<command-name>/clear</command-name><command-message>clear</command-message>` | 跳过（slash command 记录） |
| `<local-command-stdout>` | 4 | `<local-command-stdout>Compacted</local-command-stdout>` | "Compacted" → 跳过；其他 → slash-command 卡片 |

**User 顶层标记变体**。user 消息的顶层有若干布尔标记组合，决定其渲染语义：

| 变体 | 出现次数 | 说明 |
|---|---|---|
| `hasToolUseResult`（顶层 `toolUseResult` 字段） | 1080 | 工具执行结构化结果（见下方 `tool_use_result` 章节） |
| `plain`（无特殊标记） | 103 | 普通用户输入文本 |
| `isMeta` | 5 | CLI 内部消息，`isMeta: true` 不渲染为用户气泡；若有 `sourceToolUseID` 则挂到对应 tool-call 元数据 |

**处理方法**：

1. **数组 content**：
   - `text` 块 → 累积到 `userTexts`，然后生成 `role: "user"` 对话气泡
   - `tool_result` 块 → 通过 `tool_use_id` 匹配到之前的 `tool-call`，设置其 `result` 字段。如果匹配的 tool-call 已被 flush 到之前的 assistant 消息中，则回溯查找并更新
   - `is_error: true` 的 tool_result → 设置 `isError` 标记，显示错误状态
2. **字符串 content**：
   - `<local-command-stdout>Compacted</local-command-stdout>` → 如果内容为 `"Compacted"`，跳过（compact_boundary 已提供永久记录）
   - 其他 local-command-stdout → 渲染为 `role: "assistant"` 包含 tool-call 的卡片（toolName: `"slash-command"`）
   - `<local-command-caveat>` → 跳过（CLI 内部）
3. 纯文本用户消息（无 tool_result）生成用户对话气泡

**回显机制**：

CLI 在 `--output-format stream-json` 模式下**不会**将用户输入回显到 stdout。用户消息通过以下路径回到客户端：

```
客户端 sendToSocket({type:"user", ...})
  → server Claude2StreamController.message()
  → Claude2Runtime.write()
    → appendFile(FIFO)  // 写入 CLI stdin
    → relay.injectLine(msg)  // 注入 relay buffer + 广播
      → WebSocket → 客户端 onmessage → setRawMessages
```

**去重**：

- 前端 `onNew` 做**乐观更新**：在 sendToSocket 之前直接 `setRawMessages` 添加用户消息，消除 WebSocket roundtrip 延迟
- WebSocket handler 收到 relay 注入的同一消息时——比较 `rawMessages` 最后一条的 `message` 字段，相同则跳过
- 工具结果（`tool_result` block）不经过乐观更新，由 relay 注入直接传递

---

#### `result` — 轮次结束

**含义**：每个用户→AI 交互轮次的结束标记。有三种子类型。

**字段**：

| 字段             | 类型                                        | 说明                                          |
| ---------------- | ------------------------------------------- | --------------------------------------------- |
| `type`           | `"result"`                                  | 消息类型                                      |
| `subtype`        | `"success"` \| `"interrupted"` \| `"error"` | 结果类型                                      |
| `is_error`       | boolean?                                    | 是否错误（`subtype: "error"` 时为 true）      |
| `result`         | string?                                     | 错误消息（`is_error: true` 时）               |
| `num_turns`      | number?                                     | 累计轮次数                                    |
| `total_cost_usd` | number?                                     | 累计费用（美元）                              |
| `duration_ms`    | number?                                     | **本轮耗时**，用于回填本轮 reasoning metadata |
| `session_id`     | string                                      | 会话 UUID                                     |

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
| `request.display_name` | string              | 工具显示名                                              |
| `request.input`        | object              | 工具参数                                                |

```json
{
  "type": "control_request",
  "request_id": "uuid",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "AskUserQuestion",
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

1. `tool_name !== "AskUserQuestion"` → 自动 allow（发送 `control_response` 含 `behavior: "allow", updatedInput: {}`），不阻塞 UI
2. `tool_name === "AskUserQuestion"` → 将 `request_id` 注入到当前 assistant 消息中的对应 `tool_use` 块的 `input.__controlRequestId`，触发 AskUserQuestion 工具 UI 卡片渲染，等待用户交互后通过 bridge 发送 `control_response`

**历史特性**：`control_request` 是 stdout 运行时控制消息，**不写入 Claude CLI JSONL 历史**。因此 AskUserQuestion 的历史页只来自 assistant `tool_use` 本身和后续 `user.tool_result` 顶层的 `toolUseResult.answers/questions`。`request_id` 注入只发生在实时流。

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

### WebSocket 传输层消息

这些消息是 API server 在 WebSocket 层添加的，不是 CLI 原始输出。

#### `connected` — 连接确认

**含义**：WebSocket 连接建立后服务端发送的第一条消息，确认连接成功并传递会话元数据。

**字段**：`type: "connected"`, `sessionId`, `sessionType`, `status`

**处理方法**：记录连接成功，不渲染 UI。

---

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

#### `switch_model_result` — 模型切换确认

**含义**：模型切换操作的结果确认。

**字段**：`type: "switch_model_result"`, `model`, `success: boolean`, `error?: string`

**处理方法**：

1. `success: true` → 更新 UI 中的当前模型显示，递增 `modelSwitchVersion` 以强制 tool UI 重新渲染
2. `success: false` → 回退模型选择到之前的值，显示 error 信息

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
| `system.api_retry`                        | 重试通知，事件发生即确定 |
| `system.turn_duration`                    | 耗时统计，事后记录       |
| `user`                                    | 用户输入，发送即确定     |
| `result`（所有 subtype）                  | 轮次结束标记，不可变     |
| `control_request`                         | 权限请求，即时事件       |
| `connected` / `ended` / `error`（传输层） | 连接事件，瞬时           |
| `switch_model_result`                     | 切换确认，即时           |

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
| `system.status`                                  | **不渲染**                   | compact 生命周期由 CompactIndicator 组件处理                                                                                 |
| `system.compact_boundary`                        | **inline**                   | `role: "system"` 压缩分割线。**测试覆盖**                                                                                    |
| `system.api_retry`                               | **inline**                   | `role: "system"` + `systemMessageType: "error"`，含错误原因和重试次数。**测试覆盖**                                          |
| `system.turn_duration`                           | **不渲染**                   | 仅调试日志                                                                                                                   |
| `user` (text)                                    | **用户气泡**                 | 文本→用户气泡                                                                                                                |
| `user` (tool_result)                             | **tool-call result**         | 匹配 tool-call 的 `result` 字段                                                                                              |
| `user` (`isMeta: true` + `sourceToolUseID`)      | **不渲染**                   | 附加到匹配 tool-call 的 `metadata.skillContent`。**测试覆盖**                                                                |
| `user` (`isMeta: true` 无 `sourceToolUseID`)     | **不渲染**                   | CLI 内部消息直接跳过                                                                                                         |
| `user` (string content `<local-command-stdout>`) | **slash-command 卡片或跳过** | `"Compacted"` → 跳过（compact_boundary 已是权威记录）。其他 → `role: "assistant"` + toolName `"slash-command"`。**测试覆盖** |
| `user` (string content 其他)                     | **不渲染**                   | `<local-command-caveat>` 等 CLI 内部消息跳过                                                                                 |
| `user` (`toolUseResult` / `tool_use_result`)     | **structuredResult 附加**    | 挂到最近 tool-call 的 `structuredResult` 字段。值可以是对象或字符串。**测试覆盖**                                            |
| `assistant` (model=`<synthetic>`)                | **不渲染**                   | CLI 内部消息（如 compact 取消通知），跳过。**测试覆盖**                                                                      |
| `system.task_started`                            | **Task 列表**                | 加入输入框上方 task 列表，不产生聊天气泡。纯函数 `applyTaskSystemMessage`。**测试覆盖**                                      |
| `system.task_updated`                            | **Task 列表**                | 更新 task 列表中对应 task 状态。**测试覆盖**                                                                                 |
| `system.task_notification`                       | **Task 列表**                | 更新 task 列表中对应 task 输出/进度。**测试覆盖**                                                                            |
| `result.success` / `result.interrupted`          | **不渲染**                   | `isRunning = false`。`result.success` 标记 turn 正常结束                                                                     |
| `result.error` (`is_error`)                      | **inline**                   | `role: "system"` + `systemMessageType: "error"`                                                                              |
| `control_request`                                | **不渲染**                   | AskUserQuestion → 注入 request_id 到 assistant 的 tool_use                                                                   |
| `connected` / `ended`                            | **不渲染**                   | 连接状态管理                                                                                                                 |
| `error` (传输层)                                 | **inline / toast**           | 连接错误通知                                                                                                                 |
| `switch_model_result`                            | **不渲染**                   | 更新 model state                                                                                                             |

**回归测试覆盖统计**：`claude2-adapter.test.ts` 共 27 个测试、99 个断言，覆盖了 `loadMessagesFromRaw` 的所有分支和 task 状态的完整生命周期。

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

```
手动 /compact:
  status:"compacting" → [CLI 内部压缩] → compact_result → [CLI 重启 --resume] →
  compact_boundary (重放标记) → assistant/user/result 重放 → [另一个重启] → 实时 assistant

自动 compact (上下文满):
  compact_boundary (内联，无前置 status) → result → [CLI 重启 --resume] → 实时 assistant

微压缩:
  microcompact_boundary → 不重启 CLI，继续当前流
```

### 模型切换

```
用户选择新 model
  → WebSocket 发送 switch_model
  → API server 杀掉当前 CLI 进程
  → 启动新 CLI: --model <新值> --resume <sessionId>
  → CLI 重放: system.init (新 model, 原 permissionMode) → compact_boundary → 历史 → result
  → WebSocket 发送 switch_model_result { success: true }
  → 流式恢复
```

### 权限模式切换

```
用户选择新 permissionMode
  → WebSocket 发送 permission_mode
  → API server 杀掉当前 CLI 进程
  → 启动新 CLI: --permission-mode <新值> --resume <sessionId>
  → CLI 重放: system.init (原 model, 新 permissionMode) → compact_boundary → 历史 → result
  → 流式恢复
```

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
connected → replay_start → 磁盘历史 JSONL → 待刷新历史 → replay_end → 实时消息队列
```

- **`connected`**：标记 WebSocket transport 已建立。不代表 session 处于 running 状态——`isRunning` 由消息流中的三态消息生命周期驱动。
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
| `switch_model_result` | 模型切换响应 | 无 | 交互式实时消息 |
| `system/permission_denied` | 自动权限拒绝 | 低 | 2026-06 新发现的类型，字段: `decision_reason`, `decision_reason_type`, `message`, `tool_name`, `tool_use_id` |

### JSONL 独有（CLI stdout 不输出）

以下类型只出现在 JSONL 磁盘文件中，CLI stdout **不会**输出。

注意：JSONL 中 `assistant`、`user`、`mode`、`system/compact_boundary` 等类型的**外层信封格式与 CLI stdout 不同**（JSONL 多了 `parentUuid`、`isSidechain`、`uuid`、`timestamp`、`sessionId`、`cwd`、`gitBranch` 等追踪字段），但核心消息体一致。这部分差异不影响 resume 恢复，详见 [JSONL 信封字段](#jsonl-信封字段)。

**Resume 关键类型**（可用于恢复会话状态）：

| 类型 | 含义 | Resume 恢复价值 |
|---|---|---|
| `attachment` (23 种子类型) | 运行时附件：MCP 指令、skill 列表、命令权限、模式变更等 | **核心** — 可完整重建 MCP servers、skills、slash command 权限、plan/auto 模式状态 |
| `last-prompt` | 上次用户 prompt 文本 | **高** — 可用作 UI 输入回显或 draft 恢复 |
| `mode` | 运行时模式 | 中 — 恢复 `normal` / `auto` 等 mode 显示 |
| `permission-mode` | 权限模式变更 | 中 — 恢复 permission mode 显示 |
| `queue-operation` | 内部任务队列操作 | 低 — 用于 debug |

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

**含义**：auto mode 的进入和退出事件。`auto_mode` 无额外字段；`auto_mode_exit` 无额外字段。仅表示模式状态变更。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"auto_mode"` / `"auto_mode_exit"` | 子类型 |

**Resume 恢复**：最近一条 auto mode 相关 attachment 决定当前是否处于 auto mode。

---

**`plan_mode`** / **`plan_mode_exit`** / **`plan_mode_reentry`** — Plan 模式状态

**含义**：plan 模式的进入、退出和重新进入事件。

| 字段 | 类型 | 说明 |
|---|---|---|
| `attachment.type` | `"plan_mode"` / `"plan_mode_exit"` / `"plan_mode_reentry"` | 子类型 |
| `attachment.planFilePath` | string | Plan 文件绝对路径 |
| `attachment.planExists` | boolean | Plan 文件是否存在 |
| `attachment.reminderType` | string? | 提醒类型（`"full"`） |
| `attachment.isSubAgent` | boolean? | 是否为子 agent |

**Resume 恢复**：可恢复当前 plan mode 状态和关联的 plan 文件路径。

---

##### 其他子类型

以下子类型在本会话 JSONL 中出现，按频率排列：

**`task_reminder`** (122 次) — 任务提醒。`content` 为当前任务列表数组（TaskInfo[]），`itemCount` 为任务总数。

**`queued_command`** (19 次) — 排队命令。字段：`prompt` (string), `commandMode` (string)。

**`file`** (18 次) — 文件附件。字段：`filename` (string), `displayPath` (string), `content` (object, 含 `file.content`, `file.filePath`, `file.numLines` 等)。

**`compact_file_reference`** (17 次) — Compact 后文件引用。字段：`filename` (string), `displayPath` (string)。

**`edited_text_file`** (13 次) — 编辑文本文件记录。字段：`filename` (string), `snippet` (string)。

**`date_change`** (9 次) — 日期变更通知。字段：`newDate` (string, 如 `"2026-06-09"`)。

**`hook_success`** (8 次) — Hook 执行成功。字段：`hookName` (string), `hookEvent` (string), `toolUseID` (string), `command` (string), `stdout` (string), `stderr` (string), `exitCode` (number), `durationMs` (number)。

**`plan_file_reference`** (7 次) — Plan 文件内容快照。字段：`planFilePath` (string), `planContent` (string)。

**`hook_additional_context`** (7 次) — Hook 附加上下文。字段：`content` (string[]), `hookName` (string), `hookEvent` (string), `toolUseID` (string)。

`goal_status`、`opened_file_in_ide`、`diagnostics`、`selected_lines_in_ide`、`hook_non_blocking_error` 等子类型本会话未出现，暂不展开。

---

#### `mode` — 运行时模式

**含义**：CLI 运行模式记录。当前仅观察到 `"normal"` 值。

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"mode"` | 消息类型 |
| `mode` | string | 模式标识（`"normal"`） |
| `sessionId` | string | 会话 UUID |

**时机**：模式切换时写入。此类型同时出现在 CLI stdout（`{"type":"mode","mode":"..."}` 格式简单一致）。

示例：
```json
{
  "type": "mode",
  "mode": "normal",
  "sessionId": "e3ca9671-453e-4bb1-bce9-6764b189a1a2"
}
```

---

#### `permission-mode` — 权限模式变更

**含义**：用户切换 permission mode 时记录。独立于 `system/init`，是权限变更的持久化记录。

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"permission-mode"` | 消息类型 |
| `permissionMode` | string | 权限模式（`"auto"`, `"acceptEdits"`, `"plan"`, `"default"` 等） |
| `sessionId` | string | 会话 UUID |

**时机**：用户通过 `/permission-mode` 或 UI 切换权限模式时写入。

示例：
```json
{
  "type": "permission-mode",
  "permissionMode": "auto",
  "sessionId": "8ac6ff40-ea16-4666-a973-ea00c78c2af1"
}
```

---

#### `queue-operation` — 任务队列操作

**含义**：CLI 内部任务队列（subagent 调度队列）的出队/入队记录。纯内部机制，不面向用户。

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `"queue-operation"` | 消息类型 |
| `operation` | `"enqueue"` \| `"dequeue"` \| `"remove"` \| `"popAll"` | 队列操作 |
| `timestamp` | string (ISO 8601) | 操作时间 |
| `sessionId` | string | 会话 UUID |

**操作类型**：
| 操作 | 含义 |
|---|---|
| `enqueue` | 任务入队 |
| `dequeue` | 任务出队（开始执行） |
| `remove` | 任务移除（被取消或合并） |
| `popAll` | 清空队列 |

**时机**：每次 subagent 任务调度时成对出现（`enqueue` → `dequeue` / `remove`）。

**Resume 恢复**：一般不需要。仅用于 debug 任务调度时序。

示例：
```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-06-02T13:31:53.252Z",
  "sessionId": "dbcec945-e33a-428b-8a70-f17d59298257"
}
```

---

#### 标题类消息

| 类型 | 字段 | 含义 | 时机 |
|---|---|---|---|
| `ai-title` | `aiTitle` (string), `sessionId` | AI 自动生成会话标题 | 会话初期 AI 判断标题 |
| `agent-name` | `agentName` (string), `sessionId` | Agent/subagent 名称 | Agent 创建时 |
| `custom-title` | `customTitle` (string), `sessionId` | 用户自定义标题 | 用户执行重命名 |

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

**含义**：用户执行本地命令（如 `/clear`、`/compact`、`/config`）的记录。`content` 使用 XML 包裹 CLI TUI 输出。

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
| `assistant` | `parentUuid`, `isSidechain`, `uuid`, `timestamp`, `sessionId`, `cwd`, `gitBranch`, `userType`, `entrypoint`, `version`, `slug` | `message` (id, role, content, model, usage) |
| `user` | `parentUuid`, `isSidechain`, `promptId`, `uuid`, `timestamp`, `permissionMode`, `userType`, `entrypoint`, `cwd`, `sessionId`, `gitBranch`, `version`, `slug` | `message` (role, content) |
| `system/compact_boundary` | `content` (human-readable), `isMeta`, `level`, `logicalParentUuid`, `timestamp`, `slug`, `cwd`, `gitBranch` | `compactMetadata` (trigger, preTokens, durationMs 等) |
| `system/turn_duration` | `isMeta`, `timestamp`, `uuid`, `userType`, `entrypoint`, `cwd`, `gitBranch`, `version` | `durationMs`, `messageCount` |
| `system/api_error` | `isSidechain`, `level`, `maxRetries`, `retryAttempt`, `retryInMs`, `timestamp`, `uuid`, `userType`, `entrypoint`, `cwd`, `gitBranch`, `version`, `slug` | `error` (message, status 等) |
| `mode` | 格式一致（`mode`, `sessionId`） | 两端相同 |

**信封差异的本质**：JSONL 是持久化日志，需要完整的追溯信息（时间戳、分支、入口、版本等）。CLI stdout 是实时管道，只传当前处理所需的字段。

### JSONL 信封字段

几乎所有 JSONL 消息共享一套外层信封字段，用于追溯。这些字段在 resume 时用于关联和过滤：

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
| Permission Mode | `SessionMetadata.permissionMode` / JSONL `permission-mode` | 已持久化 + JSONL 补充 |
| Slash Commands | `system/init` → 持久化到 `SessionMetadata.slashCommands` | **待实现** |
| Skills | `system/init` → 持久化到 `SessionMetadata.skills` / JSONL `attachment.skill_listing` 补充 | **待实现** |
| MCP Servers | JSONL `attachment.mcp_instructions_delta` | 可选实现 |
| Plan Mode State | JSONL `attachment.plan_mode` / `plan_mode_exit` | 可选实现 |
| Auto Mode State | JSONL `attachment.auto_mode` / `auto_mode_exit` | 可选实现 |

### API 重启后的数据丢失

API 进程重启后，relay 从 JSONL 重建历史快照。内存 buffer（`bufferLines`）因为仅在内存中也会清空。以下数据会从 WebSocket 回放中**永久消失**：

1. **`system/init`**：`slash_commands`、`skills`、`tools`、`agents`、`plugins`、`cwd` 等一次性启动参数
2. **`result`**：最近一个 turn 的结束标记；回放中只有 `assistant` 而没有 `result`，`isRunning` 可能误判
3. **`system/task_started/updated/notification`**：活跃 task 的状态

**修复原则**：

- `system/init` 的关键字段（`slash_commands`, `skills`）在 `captureSystemInitFromLine` 中捕获并通过 `onSystemInit` 回调持久化到 SessionMetadata
- `buildBootstrapPlan` 检查 relay+buffer 快照中是否存在 `system/init`，若不存在则从 SessionMetadata 合成一条注入
- `model` 和 `permissionMode` 已持久化，无需额外处理
