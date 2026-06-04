# Claude CLI stream-json 协议

本文档沉淀 Claude CLI (`claude`) 的 stdio stream-json 协议——它是 Agent Runtime 与 CLI 进程之间的通信契约，也是 model、permissionMode 等会话状态的唯一权威来源。

## 概述

Claude CLI 通过 stdin/stdout 以 JSONL（每行一个 JSON）方式通信：

```
stdin  ← 我们写入 user / control_response
stdout → CLI 输出 system.init / assistant / result / control_request
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

## system.init 消息

CLI 启动后第一条 stdout 消息，包含当前会话的完整配置。

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

### system.init 是模型和权限模式的唯一权威来源

无论是新 session 还是恢复已有 session，`model` 和 `permissionMode` 都通过 `system.init` 确定：

| 场景 | model 来源 | permissionMode 来源 |
|------|-----------|-------------------|
| 新 session（无 `--resume`，无 `--model`） | CLI 默认 | CLI 默认（通常 `"auto"`） |
| 新 session（有 `--model`） | 传入值 | CLI 默认 |
| 恢复 session（`--resume`） | CLI JSONL 文件中上次使用的 model | CLI JSONL 文件中上次使用的 permissionMode |
| 切换 model（`--model X --resume`） | 新传入值 | CLI JSONL 文件中的值 |

**关键结论**：我们不需要在 `SessionMetadata` 中持久化 model 或 permissionMode。CLI 的 JSONL session 文件 + `system.init` 已经覆盖了所有场景。

## 消息类型

### 客户端 → CLI（stdin）

| type | 说明 |
|------|------|
| `user` | 用户输入，`message.content` 是 text/tool_result 数组 |
| `control_response` | 响应权限请求（AskUserQuestion 等） |
| `control_request` | 传入外部工具调用（极少用） |

### CLI → 客户端（stdout）

| type | subtype | 说明 |
|------|---------|------|
| `system` | `init` | 会话初始化，含 model、permissionMode、tools 等 |
| `system` | `status` | 状态变更，如 `compacting`、`compact_result` |
| `system` | `compact_boundary` | 上下文压缩记录，含 preTokens、trigger |
| `system` | `microcompact_boundary` | 微压缩记录 |
| `system` | `api_retry` | API 重试通知，含 attempt、max_retries、delay |
| `system` | `turn_duration` | 轮次耗时统计 |
| `assistant` | — | AI 回复，content 含 text / tool_use / thinking |
| `user` | — | 用户消息回显（含 tool_result） |
| `result` | `success` / `error` / `interrupted` | 轮次结束，含 is_error、result、duration_ms |
| `control_request` | `can_use_tool` | 权限请求（Bash、Write、AskUserQuestion 等） |

### 关于 compact_boundary 和 microcompact_boundary

这是 CLI 写入 JSONL 的持久化压缩记录（`isMeta: false`），不是元数据。恢复 session 时 CLI 会重放这些记录。

我们在消息流中以 role:"system" 渲染它们，作为上下文压缩的永久分割线。

### 关于 api_retry

API 返回 502/overloaded 时 CLI 自动重试。我们在 composer 上方显示琥珀色横幅指示重试状态。一旦新的 `system.init` 或 `assistant` 消息到达即自动清除。

### 关于 result.is_error

API 错误（如 422 model not found）以 `result` 消息返回，`is_error: true`。我们在消息流中以红色分割线渲染 error 文本，确保用户看到错误信息而非静默失败。

## 生命周期

```
CLI 启动
  → system.init            (会话配置)
  → [compact_boundary...]  (如果 --resume，重放压缩记录)
  → assistant / user       (如果 --resume，重放历史消息)
  → result                 (历史轮次结束)
  → [以上三步骤可能重复多次]

用户发送消息
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

### 模型切换

```
用户选择新 model
  → 杀掉当前 CLI 进程
  → 启动新 CLI: --model <新值> --resume <sessionId>
  → system.init (新 model, 原 permissionMode)
  → [历史重放]
  → 流式恢复
```

### 权限模式切换

```
用户选择新 permissionMode
  → 杀掉当前 CLI 进程
  → 启动新 CLI: --permission-mode <新值> --resume <sessionId>
  → system.init (原 model, 新 permissionMode)
  → [历史重放]
  → 流式恢复
```

## 我们的集成方式

```
Browser (WebSocket)  ←→  API server  ←→  CLI subprocess (stdin/stdout)
```

- API server 是透明代理：CLI stdout JSON → 解析 → WebSocket send
- 唯一的状态追踪是 `system.init` 中的 `session_id`（存为 `claudeSessionId` 用于 `--resume`）和 `model` / `permissionMode`（转发前端显示）
- 不自行持久化 model 或 permissionMode——CLI JSONL 文件是权威存储
