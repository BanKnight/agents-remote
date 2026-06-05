# Claude CLI stream-json 协议

本文档沉淀 Claude CLI (`claude`) 的 stdio stream-json 协议——它是 Agent Runtime 与 CLI 进程之间的通信契约，也是 model、permissionMode 等会话状态的唯一权威来源。

## 概述

Claude CLI 通过 stdin/stdout 以 JSONL（每行一个 JSON）方式通信：

```
stdin  ← 我们写入 user / control_response / control_request (interrupt)
stdout → CLI 输出 system.init / assistant / user / result / control_request
```

每行是一个完整的 JSON 对象，以 `\n` 分隔。

## 启动参数

我们使用以下核心参数：

| 参数 | 用途 |
|------|------|
| `--output-format stream-json` | stdout 输出 JSONL |
| `--input-format stream-json` | stdin 接受 JSONL |
| `--verbose` | 输出 thinking / reasoning |
| `--permission-prompt-tool stdio` | 权限请求走 stdin/stdout 而非 TUI |
| `--model <tier>` | 指定模型（可选，缺省用 CLI 默认） |
| `--permission-mode <mode>` | 权限模式（可选，缺省用 CLI 默认） |
| `--resume <sessionId>` | 恢复已有 session（可选，CLI 从自己的 JSONL 文件加载状态） |

## 完整消息类型规范

### CLI → 客户端（stdout）

#### `system` / `init` — 会话初始化

CLI 启动后的会话元数据。**只在第一条用户消息到达后发送**——CLI 启动时不立即发送。

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "uuid",
  "model": "claude-sonnet-4-6[1m]",
  "permissionMode": "auto",
  "cwd": "/path/to/project",
  "tools": ["Task", "Bash", "Read", "Write", ...],
  "slash_commands": ["compact", "clear", ...],
  "mcp_servers": [...],
  "agents": ["claude", "Explore", ...],
  "skills": [...],
  "plugins": [...],
  "apiKeySource": "none",
  "claude_code_version": "2.1.160",
  "output_style": "default"
}
```

**时效性**：

| 场景 | model 来源 | permissionMode 来源 |
|------|-----------|-------------------|
| 新 session（用户尚未发消息） | `--model` 显式传入，或 CLI 默认 | `--permission-mode` 显式传入，或 CLI 默认 |
| `--resume` 恢复 session | CLI JSONL 文件中的上次值 → system.init | CLI JSONL 文件中的上次值 → system.init |
| 切换 model（`--model X --resume`） | 新传入值 `X` | CLI JSONL 文件中的值 |
| 切换 permissionMode（`--permission-mode Y --resume`） | CLI JSONL 文件中的值 | 新传入值 `Y` |

**关键结论**：新 session 必须在创建时显式传入 `--model` 和 `--permission-mode`
（参考 hapi 的 `bootstrapSession` 方案），因为 system.init 在用户发消息前不可用。
对于恢复/重连，system.init 是权威来源。两个值同时存入 `SessionMetadata`
以便 REST API 在 system.init 到达前返回初始值。

#### `system` / `status` — 状态变更

CLI 内部状态通知。

```json
// compact 开始
{ "type": "system", "subtype": "status", "status": "compacting", "session_id": "...", "uuid": "..." }

// compact 完成
{ "type": "system", "subtype": "status", "status": null, "compact_result": "success", "session_id": "...", "uuid": "..." }

// compact 失败
{ "type": "system", "subtype": "status", "status": null, "compact_result": "failed", "compact_error": "...", "session_id": "...", "uuid": "..." }
```

#### `system` / `compact_boundary` / `microcompact_boundary` — 上下文压缩标记

CLI 写入 JSONL 的持久化压缩记录（`isMeta: false`），不是元数据。恢复 session 时 CLI 会重放这些记录。

```json
// 压缩边界（自动或手动触发）
{
  "type": "system",
  "subtype": "compact_boundary",
  "compactMetadata": { "trigger": "auto" | "manual", "preTokens": 123456 }
}

// 微压缩边界
{
  "type": "system",
  "subtype": "microcompact_boundary",
  "microcompactMetadata": { "trigger": "auto", "preTokens": 80000, "tokensSaved": 12345 }
}
```

在消息流中以 role:"system" 渲染它们，作为上下文压缩的永久分割线。

#### `system` / `api_retry` — API 重试通知

API 返回 502/overloaded 时 CLI 自动重试。

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

在 composer 上方显示琥珀色横幅指示重试状态。新的 `system.init` 或 `assistant` 消息到达后自动清除。

#### `system` / `turn_duration` — 轮次耗时统计

```json
{
  "type": "system",
  "subtype": "turn_duration",
  "duration_ms": 3500,
  "session_id": "..."
}
```

仅用于调试日志，不在 UI 中渲染。

#### `system` / `thinking_tokens` — 推理 token 计数

```json
{
  "type": "system",
  "subtype": "thinking_tokens",
  "estimated_tokens": 15000,
  "estimated_tokens_delta": 500,
  "session_id": "...",
  "uuid": "..."
}
```

用于显示推理进度指示器。

#### `assistant` — AI 回复

流式发送，同一回复可能跨多行。`message.id` 标识同一个回复。

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_uuid",
    "role": "assistant",
    "model": "claude-sonnet-4-6[1m]",
    "content": [
      { "type": "text", "text": "Markdown 文本..." },
      { "type": "thinking", "thinking": "推理过程...", "signature": "..." },
      { "type": "tool_use", "id": "toolu_uuid", "name": "Bash", "input": { "command": "ls" } }
    ]
  },
  "session_id": "..."
}
```

- `model: "<synthetic>"` —— CLI 内部消息（如 compact 取消通知），必须跳过不渲染
- `content` 数组中的 block 类型：`text`（Markdown 文本）、`thinking`（推理过程，verbose 模式）、`tool_use`（工具调用）

#### `user` — 用户消息回显

CLI 将用户输入（包括工具结果）回显到 stdout。

```json
// 用户文本输入
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

// CLI 命令输出（字符串形式，如 /compact 结果）
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "<local-command-stdout>Compacted</local-command-stdout>"
  }
}
```

两种 content 形态：
- **数组**：正常的用户输入或工具结果，包含 `type: "text"` 和 `type: "tool_result"` 两种 block
- **字符串**：CLI 内部命令输出，如 `<local-command-stdout>Compacted</local-command-stdout>`。这类消息在 JSONL 中存储，`isMeta: false`

**文本用户消息去重**：WebSocket 实时流中会收到用户消息回显（纯文本，不含 tool_result）。由于我们已经在前端本地添加了用户消息气泡，必须跳过纯文本用户回显以避免重复。但工具结果（含 tool_result block）需要传递给前端用于渲染工具卡片。

#### `result` — 轮次结束

每个完整的用户→AI 交互轮次以一条 `result` 消息结束。

```json
// 成功
{
  "type": "result",
  "subtype": "success",
  "session_id": "...",
  "num_turns": 5,
  "total_cost_usd": 0.0123,
  "duration_ms": 8500
}

// 用户中断
{
  "type": "result",
  "subtype": "interrupted",
  "session_id": "...",
  "num_turns": 3
}

// API 错误（如 422 model not found）
{
  "type": "result",
  "subtype": "error",
  "is_error": true,
  "result": "Model not found: claude-unknown",
  "session_id": "..."
}
```

- `is_error: true` → 在消息流中以红色分割线渲染 error 文本
- `subtype: "interrupted"` → 用户点击了停止或发送了 interrupt
- `subtype: "success"` → 正常结束

#### `control_request` — 权限请求

CLI 通过 `--permission-prompt-tool stdio` 将权限提示路由到 stdout。

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
        { "question": "...", "header": "...", "options": [...] }
      ]
    }
  }
}
```

- `tool_name` 可能是 `AskUserQuestion`、`Bash`、`Write`、`Read` 等
- 非 `AskUserQuestion` 的工具一律自动 allow（不阻塞 UI）
- `AskUserQuestion` 需要用户交互，通过 `control_response` 响应

### 客户端 → CLI（stdin）

#### `user` — 用户输入

```json
// 文本消息
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{ "type": "text", "text": "用户输入" }]
  }
}

// 工具结果（权限提示中的用户选择会被转换为 tool_result）
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{ "type": "tool_result", "tool_use_id": "toolu_uuid", "content": "结果" }]
  }
}
```

#### `control_response` — 响应权限请求

```json
// 允许
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "uuid",
    "response": { "behavior": "allow", "updatedInput": { "answers": { "q": "a" }, "其他字段": "值" } }
  }
}

// 拒绝
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "uuid",
    "response": { "behavior": "deny", "message": "User skipped" }
  }
}
```

注意：`request_id` 在 `response` 对象内，不在顶层（与 Claude SDK 的 `CanUseToolControlResponse` 格式一致）。

#### `control_request` (interrupt) — 中断执行

```json
{
  "type": "control_request",
  "request_id": "uuid",
  "request": { "subtype": "interrupt" }
}
```

发送 interrupt 后 CLI 返回 `result` 消息（`subtype: "interrupted"`）。

### WebSocket 传输层消息

这些消息是 API server 在 WebSocket 层添加的，不是 CLI 原始输出。

| type | 说明 |
|------|------|
| `connected` | WebSocket 连接确认，含 sessionId、sessionType、status |
| `replay_start` | 缓冲区回放开始，含 `count`（回放消息数）。前端收到后清空消息列表 |
| `replay_end` | 缓冲区回放结束，之后所有消息为实时流 |
| `ended` | 会话结束通知（跟随在 `result` 消息后） |
| `error` | 传输层错误，含 code、message |
| `switch_model_result` | 模型切换确认，含 model、success、error? |

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
  → user (tool_result)     (工具结果回显)
  → [assistant → tool_use → control_request → tool_result 循环]
  → result                 (轮次完成)
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
Browser (WebSocket)  ←→  API server  ←→  CLI subprocess (stdin/stdout)
                                              │
                        stdout buffer (内存)  ←┘
```

### stdout 缓冲与重放机制

API server 缓冲 CLI 的 stdout 原始 JSONL 行（全量，不裁剪）。
新 WebSocket 订阅者连接时，服务端先回放缓冲区全部内容，再转入实时流。

```
新订阅者连接
  → replay_start (WebSocket)
  → [缓冲区逐条回放: system.init, user, assistant, result, ...]
  → replay_end (WebSocket)
  → [实时流继续]
```

**当前状态**：第一版全量回放，不做分页裁剪。超大会话的分页优化待后续讨论后实现。

### 职责边界

- **stdout buffer**：服务端内存缓冲，负责重连时的即时状态恢复（system.init、model、permissionMode、最近消息）
- **REST /messages**：深分页加载旧消息，cursor-based
- **SessionMetadata**：持久化 model 和 permissionMode（供 REST API 在 system.init 到达前返回初始值，也供 `ensureRunning` 重建进程时传入 CLI）
- **CLI JSONL**：model 和 permissionMode 的权威历史存储（`--resume` 时 CLI 从中恢复）
