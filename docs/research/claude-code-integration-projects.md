# Claude Code 集成项目调研

调研多个使用 Claude CLI stream-json 协议的开源项目，分析其 model 和 permission mode 初始化、持久化和切换策略。

## 调研项目

| 项目 | Stars | 语言 | 定位 |
|------|-------|------|------|
| [hapi](https://github.com/tiann/hapi) | — | TypeScript | 多 Agent（Claude/Codex/Gemini 等）Web 控制台 |
| [xylocopa](https://github.com/jyao97/xylocopa) | 47 | Python/React | Claude Code agent 的 Web 任务管理后台 |
| [claude-squad](https://github.com/smtg-ai/claude-squad) | 7710 | Go | 终端 TUI 多 Agent 管理 |
| [claude-code-sdk-ts](https://github.com/instantlyeasy/claude-code-sdk-ts) | 206 | TypeScript | Claude CLI 的链式 SDK 封装 |
| [claude-code-webui](https://github.com/sugyan/claude-code-webui) | 1128 | TypeScript | Claude CLI Web UI |

---

## hapi（最直接参考）

### Model 方案

**前端** `web/src/components/NewSession/types.ts`：
```typescript
MODEL_OPTIONS = {
  claude: [
    { value: "auto", label: "Auto" },
    { value: "opus", label: "Opus" },
    { value: "sonnet", label: "Sonnet" },
  ]
}
```

**后端** `cli/src/claude/runClaude.ts`：
- `bootstrapSession` 显式传 `--model` 给 CLI
- `normalizeClaudeSessionModel()` 标准化 model 值

### Permission Mode 方案

**shared** `shared/src/modes.ts`：
```typescript
CLAUDE_PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan']
```

**后端** `cli/src/commands/claude.ts`：
- `--permission-mode` 参数校验对 `CLAUDE_PERMISSION_MODES`
- `bootstrapSession` 显式传 permission mode 给 CLI

### 关键设计

- **新建 session**：显式传 `--model` 和 `--permission-mode`
- **恢复 session**：`--resume` + system.init 恢复
- **持久化**：存入服务端数据库（不在 CLI JSONL 之外重复持久化）
- **列表来源**：硬编码常量，按 provider 区分

---

## xylocopa（最完整实现）

### Model 方案

**前端** `frontend/src/lib/constants.js`：
```javascript
MODEL_OPTIONS = [
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
]
```

**后端** `orchestrator/config.py`：
```python
CC_MODEL = os.getenv("CC_MODEL", "claude-opus-4-8")
VALID_MODELS = {
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6",
    "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
}
```

### Permission Mode 方案

xylocopa **不使用 permission mode 下拉选择**，而是用布尔值：
- `skip_permissions: True` → CLI 带 `--dangerously-skip-permissions`
- `skip_permissions: False` → 通过 `PermissionManager` 做交互式工具审批（PreToolUse hook）

### Model 初始化策略（与 hapi 不同）

xylocopa 不在 CLI 启动时传 `--model`。而是：
1. CLI 以自己的默认 model 启动
2. 启动后通过 `_parse_session_model()` 从 JSONL 第一条 assistant 消息提取实际 model
3. 写回 `Agent.model` 数据库字段

这是一个「事后检测」而非「事前指定」的策略。

### 持久化

使用 SQLite 数据库，model 存储在三个地方：
- `Task.model` — 任务级别的 model 选择
- `Agent.model` — Agent 当前使用的 model
- `CCSession.model` — 每个 CLI session 的 model

### 关键设计

- Model 使用**完整名称**而非 alias（如 `claude-opus-4-8` 而非 `opus`）
- 前后端各维护一份 model 列表，用 `VALID_MODELS` 做后端校验
- 默认 model 可通过环境变量 `CC_MODEL` 配置
- 不使用 `--model` 参数启动 CLI，事后从 JSONL 检测

---

## claude-code-sdk-ts

### Model 方案

`model?: string` — 自由字符串，透传给 CLI 的 `--model` 参数。SDK 层不做校验，由 CLI 自身校验。

### Permission Mode 方案

```typescript
PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'
```
硬编码 3 个值。

---

## claude-code-webui

### Model 方案

不支持 model 选择。`ChatRequest` 中没有 model 字段。

### Permission Mode 方案

```typescript
permissionMode?: "default" | "plan" | "acceptEdits"
```
硬编码 3 个值。

---

## claude-squad

Go 语言 TUI 项目，model 作为 program 配置字符串的一部分（如 `"aider --model ollama_chat/gemma3:1b"`），不做单独管理。架构差异较大，参考价值有限。

---

## 综合对比

| 维度 | hapi | xylocopa | sdk-ts | webui |
|------|------|----------|--------|-------|
| Model 列表来源 | 硬编码 alias | 硬编码全名 | 自由字符串 | 不支持 |
| Permission 列表来源 | 硬编码 | 布尔值 | 硬编码 | 硬编码 |
| 新建时传 --model | ✅ 是 | ❌ 否（事后检测） | ✅ 透传 | N/A |
| 新建时传 --permission-mode | ✅ 是 | 用 skip 标志 | N/A | N/A |
| 持久化位置 | 服务端 DB | SQLite | 无 | 无 |
| 从 CLI --help 读取 | ❌ | ❌ | ❌ | ❌ |

---

## 结论

1. **所有项目都硬编码 model 和 permission mode 列表**，没有一个从 CLI --help 动态读取。
2. **权限模式列表因项目而异**：hapi 用 4 个，xylocopa 用布尔值，sdk-ts/webui 用 3 个——都没有完整覆盖 CLI --help 的 6 个 choices。
3. **Model 有两种策略**：hapi 事前指定（`--model`），xylocopa 事后检测（读 JSONL）。
4. **所有项目在新建 session 时都需要确定 model**——无论是显式传入 CLI 还是事后从 JSONL 读取。
