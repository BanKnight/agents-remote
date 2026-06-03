# Claude2 Provider 协议设计

定义 Claude2 agent provider 基于 `--output-format stream-json --permission-prompt-tool stdio` 的完整协议契约，包括消息流、双层 ID 架构、权限生命周期、缓冲策略和状态驱动 UI 规则。

本协议设计参考了 [hapi](https://github.com/tiann/hapi) 的 Query/Permission 架构，并预留 Codex 等后续 provider 的统一接入模式。

## 协议分层

```
浏览器 (assistant-ui Chat UI)
    ↕ WebSocket（结构化 JSON 消息）
Bun API Server (Claude2StreamController)
    ↕ stdin/stdout（newline-delimited JSON）
Claude CLI 子进程 (--permission-prompt-tool stdio)
```

**关键约束：**
- 不经过 tmux，直接 `Bun.spawn` 子进程
- 所有面向前端的消息通过 WebSocket 的 `SessionStreamServerMessage` 联合类型承载
- 所有面向 Claude 的输入通过 `stdin.write()` + `FileSink.flush()` 写入

## 消息类型

### Server → Client（`SessionStreamServerMessage` 的子类型）

| 类型 | 用途 |
|------|------|
| `Claude2SystemInit` | 会话初始化（session_id, model, cwd, tools, slash_commands） |
| `Claude2AssistantMessage` | 助手消息（text + tool_use + thinking blocks），每个 message 有唯一 `id` |
| `Claude2UserMessage` | 用户消息回显（包括 tool_result echo） |
| `Claude2Result` | Turn 完成（subtype: success/error/interrupted，携带 usage/cost） |
| `Claude2ControlRequest` | 权限请求（Bash/Write/AskUserQuestion 等通过 stdio 路由） |

### Client → Server（`SessionStreamClientMessage` 的子类型）

| 类型 | 用途 |
|------|------|
| `claude2:user` | 用户文本输入 |
| `claude2:control_response` | 权限响应（request_id + answers/response） |

## 核心设计：双层 ID 架构

这是整个协议最重要的设计决策。

### 问题

Claude 对同一个 AskUserQuestion 操作产生两套不同的 UUID：

| ID | 来源 | 作用域 | 持久化 |
|---|---|---|---|
| `tool_use.id` | assistant 消息的 `content[].tool_use.id` | message stream 的 tool-call ↔ tool-result 关联 | **是**——写入 JSONL 历史 |
| `request_id` | `control_request` 消息的顶层字段 | control channel 的 request ↔ response RPC 匹配 | **否**——瞬态，JSONL 不保存 |

### 决策

**`tool_use.id` 是持久化主键，`request_id` 是瞬态 RPC key。**

类比数据库：
- `tool_use.id` = 数据库主键，tool_result 通过 `tool_use_id` 外键关联
- `request_id` = 一次 RPC 调用的临时 correlation ID，响应返回后即失效

### 实现映射

**Live stream（实时流）：**

1. Assistant 消息到达，包含 AskUserQuestion `tool_use` block
2. Adapter 创建 tool-call card，card toolCallId = `tool_use.id`
3. Card args 中预留 `__controlRequestId` 占位符（空字符串）
4. Adapter **缓冲**此消息，等待后续 `control_request`
5. `control_request` 到达，将 `request_id` 注入到 `__controlRequestId`
6. 缓冲击中，单次 yield（一张卡片，同时拥有 `toolCallId` 和 `request_id`）
7. 用户提交回答 → bridge.respondToControlRequest(request_id, answers)
8. Claude 回显 tool_result，`tool_use_id` 匹配 `toolCallId` → 卡片完成

**History load（历史加载，loadMessagesFromRaw）：**

1. JSONL 中不存在 `control_request` 消息（Claude 不持久化它）
2. AskUserQuestion 来自 assistant 消息的 `tool_use` block
3. `tool_use.id` 与后续 user 消息的 `tool_result.tool_use_id` 匹配
4. 匹配成功 → 卡片显示"已回答"（result 字段有值）
5. 匹配失败 → 卡片显示"未回答"（result 字段空）
6. `__controlRequestId` 在历史中始终为空——无需 bridge 响应

### 为什么不选择其他方案

**方案 A（已废弃）：用 `request_id` 作为 card toolCallId**
- 问题：`request_id` JSONL 中不存在，历史加载无法展示卡片
- 问题：tool_result echo 的 `tool_use_id` 不匹配，需要 `setLocalAnswer` 乐观更新

**方案 B：hapi 的模式（独立 permission 表）**
- hapi 有 Hub 层的 `AgentState.requests[request_id]` 存储权限状态
- permission 与 tool card 在渲染层合并（`getPermissions()` + `ensureToolBlock()`）
- 我们无独立 Hub，采用更简单的单层缓冲方案

## 缓冲策略

当前实现使用**单消息缓冲**——仅缓冲包含 AskUserQuestion tool_use 的 assistant 消息。

```
assistant msg (with AskUserQuestion tool_use)
    → buffer (不 push history)

control_request (AskUserQuestion)
    → 注入 __controlRequestId → push history → resolveNext

后续消息 (tool_result / assistant / result)
    → 正常转换和 push
```

**降级路径：** 若 `control_request` 未在合理时间内到达（下一个非 control_request 消息到达前），buffer 直接 flush——卡片渲染但无 submit 按钮（fallback：用户手动输入）。

**为什么不缓冲其他工具的消息：**
- Bash/Write/Read 等工具：`control_request` 自动允许（空 `control_response`），卡片不需要 submit 按钮
- 这些工具的 `tool_use` 直接从 assistant 消息正常推送，匹配 tool_result

## 卡片状态机（服务端驱动）

AskUserQuestion 卡片的所有状态转换由服务端消息驱动，**不做乐观更新**。

```
                  ┌──────────┐
                  │ 未回答    │  tool_use 到达，尚无 tool_result
                  │ (等待中)  │
                  └────┬─────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   control_request  tool_result  取消 / 错误
   到达 (缓冲注入)    回显到达       (error status)
          │            │
          ▼            ▼
   ┌──────────┐  ┌──────────┐
   │ 等待回答  │  │ 已回答    │
   │ (pulse)  │  │ (result) │
   └────┬─────┘  └──────────┘
        │
   用户提交
   (bridge.respondToControlRequest)
        │
        ▼
   ┌──────────┐
   │ 等待确认  │  tool_result echo 到达前
   │ (pulse)  │
   └────┬─────┘
        │
    tool_result echo 到达
    (tool_use_id 匹配 toolCallId)
        │
        ▼
   ┌──────────┐
   │ 已回答    │
   │ (result) │
   └──────────┘
```

**状态判定（在 AskUserQuestionToolUI 中）：**
- `isRunning && !hasResult` → "等待回答…"（pulse 动画，submit 按钮可用）
- `!isRunning && !hasResult` → "未回答"（历史中 tool_result 未匹配）
- `hasResult` → "已回答"（tool_result 已匹配，显示答案文本）

**去除乐观更新：** 旧实现用 `setLocalAnswer` 在提交时立即显示"已回答"。新实现中，提交后卡片保持"等待回答…"状态，直到 Claude 回显 tool_result 匹配成功——状态由服务器驱动。

## 工具审批路由

```
control_request 到达 onmessage
    │
    ├─ tool_name !== "AskUserQuestion"
    │   → auto-allow: sendToSocket({ type: "control_response", request_id })
    │   → return (不创建卡片，不推 history)
    │
    └─ tool_name === "AskUserQuestion"
        → 注入 __controlRequestId 到缓冲的 assistant 消息
        → push history → resolveNext
        → 卡片渲染后，用户通过 bridge 交互
```

## 与 hapi 的对照

| 方面 | hapi | agents-remote (claude2) |
|------|------|------------------------|
| Permission 存储 | Hub `AgentState.requests[request_id]` | 缓冲在客户端 memory |
| 消息传输 | CLI → WebSocket → Hub → SSE → UI | CLI → Bun.spawn stdout → WebSocket → UI |
| ID 映射 | 独立 permission.id，渲染时合并到 tool card | tool_use.id 直接做 card ID |
| Stream 模式 | `Query` 类 `AsyncIterableIterator<SDKMessage>` | `ChatModelAdapter.run()` async generator |
| 重连/恢复 | CLI 独立 reconnect + backfill | `--resume <session_id>` 恢复子进程 |
| 数据库 | SQLite（Hub 端） | JSONL（Claude CLI 管理） |

## Provider 无关模式（Codex 接入参考）

以下模式是 provider-agnostic 的，未来接入 Codex 时可复用：

1. **持久化 ID 优先**：工具 block 的持久化 ID 作为 UI card 主键，瞬态 RPC ID 只注入 args
2. **缓冲策略**：需要额外 RPC 信息的卡片，缓冲等待关联消息到达后单次合并 yield
3. **服务端驱动状态**：卡片状态由消息流中的 tool_result 回显驱动，不做乐观更新
4. **自动允许路由**：非交互式工具在 transport 层直接响应，不创建 UI card
5. **convertMessage 纯函数**：消息→assistant-ui 格式转换保持无副作用，便于独立测试
6. **bridge 模式**：React Context 传递 transport 能力到深层 UI 组件，避免模块级单例

Codex 接入时需适配的部分：
- 子进程启动参数（Codex 的 stdout/stderr 协议可能不同）
- 权限机制（Codex 可能不使用 `control_request`）
- 消息类型（需扩展 `SessionStreamServerMessage` 联合类型）

## 变更记录

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-06-03 | 采用 tool_use.id 为 card toolCallId，request_id 退居 args | 用户反馈 setLocalAnswer 乐观更新不可靠；DeepWiki 研究确认 hapi 采用的同款设计原则 |
| 2025-12-19 | 初版实现，使用 request_id 为 card toolCallId | 最早可用版本，但有 ID 不匹配和乐观更新问题 |
