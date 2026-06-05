# Xylocopa 项目深度分析

> 分析时间：2026-06-05
> 来源仓库：~/repos/xylocopa
> 分析范围：项目架构、Claude CLI 启动、模型处理、权限管理、会话初始化、数据持久化、消息同步管线、与自身/hapi 的对比

---

## 1. 项目概述

### 1.1 它是什么？

Xylocopa（黄胸木蜂）是一个**多实例 Claude Code 编排系统**。它解决的问题是：当你在多个项目上并行运行多个 Claude Code agent 时，如何在一个统一的 Web 界面中管理和监控所有这些 agent。

核心问题陈述来自 README：

> Vanilla `claude` is fine for one-off sessions. It frays once you run several in parallel, across multiple projects, over multiple days.

### 1.2 解决的问题

- **多项目并行注意力管理**：一个全局的"Attention 按钮"聚合所有 agent 的未读/待处理通知
- **上下文压缩**：新 agent 自动获得历史 session 的 RAG 上下文（PROGRESS.md）
- **跨 session 引用**：agent 之间通过内置 MCP 服务器互相读取 session（比原始 JSONL 少 ~54x tokens）
- **双向 CLI 同步**：CLI session 显示在 Web 端，Web session 可 `tmux attach -t xy-<id>` 从 CLI 恢复
- **权限审批系统**：Supervised 模式下，每个工具调用需要用户 Web UI 审批

### 1.3 高层架构

```
                    ┌──────────────┐
                    │   React PWA  │  (Vite, Tailwind, TanStack Query)
                    │  frontend/   │
                    └──────┬───────┘
                           │ HTTP + WebSocket
                    ┌──────▼───────┐
                    │   FastAPI    │  (Python 3.11+, SQLAlchemy)
                    │ orchestrator/│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │  tmux      │ │ SQLite │ │ Claude   │
        │  panes     │ │ DB     │ │ Code CLI │
        └───────────┘ └────────┘ └──────────┘
```

**技术栈**：
- 后端：Python 3.11+ (FastAPI, SQLAlchemy)
- 前端：React 19 (Vite, TanStack Query, Tailwind)
- 数据库：SQLite
- 进程隔离：tmux session per agent + git worktree

---

## 2. Claude CLI 如何被启动

### 2.1 精确的命令参数

Xylocopa 通过 `CLAUDE_BIN` 环境变量定位 Claude CLI（默认 `"claude"`）。启动命令构建在 `routers/agents.py` 的两个关键路径中：

**路径 A：`POST /api/agents`** (agent + prompt 一次性创建，line 658-668)：

```python
cmd_parts = [CLAUDE_BIN, "--session-id", pre_session_id,
             "--output-format", "stream-json", "--verbose"]
if body.skip_permissions:
    cmd_parts.append("--dangerously-skip-permissions")
if agent_model:
    cmd_parts += ["--model", _model_for_cli(agent_model)]
if body.effort:
    cmd_parts += ["--effort", body.effort]
if wt:
    cmd_parts += ["--worktree", wt]
```

**路径 B：`POST /api/agents/launch-tmux`** (纯 CLI 交互启动，line 817-827)：

```python
cmd_parts = [CLAUDE_BIN,
              "--session-id", pre_session_id,
              "--output-format", "stream-json", "--verbose"]
if skip_permissions:
    cmd_parts.append("--dangerously-skip-permissions")
if model:
    cmd_parts += ["--model", _model_for_cli(model)]
if effort:
    cmd_parts += ["--effort", effort]
if worktree:
    cmd_parts += ["--worktree", worktree]
```

**路径 C：恢复模式** (line 2656-2665)：

```python
cmd_parts = [CLAUDE_BIN,
              "--output-format", "stream-json", "--verbose"]
if agent.skip_permissions:
    cmd_parts.append("--dangerously-skip-permissions")
if agent.model:
    cmd_parts += ["--model", _model_for_cli(agent.model)]
if agent.worktree:
    cmd_parts += ["--worktree", agent.worktree]
if agent.session_id:
    cmd_parts += ["--resume", agent.session_id]
```

### 2.2 关键参数解读

| 参数 | 作用 |
|------|------|
| `--session-id <uuid>` | 预生成 session UUID，在 Claude 实际启动前写入 `.owner` sidecar 文件，确保 session 从第一个 JSONL 行就有身份 |
| `--output-format stream-json` | 使 Claude 以流式 JSON 格式输出到 JSONL，而非纯文本。这使得 orchestrator 可以解析每 turn 的结构 |
| `--verbose` | 启用详细输出 |
| `--dangerously-skip-permissions` | 跳过所有权限审批 |
| `--model <id>` | 指定模型 |
| `--effort <level>` | 指定 effort 级别 (low/medium/xhigh/max) |
| `--worktree <name>` | 在 git worktree 中运行 |
| `--resume <sid>` | 恢复现有 session（仅恢复路径） |

### 2.3 tmux 集成

每个 agent 获得独立的 tmux session，命名规则：`xy-{agent_id[:8]}`（旧格式 `ah-{agent_id[:8]}` 仍被识别用于升级兼容）。

**启动流程** (`_create_tmux_claude_session`，被 `asyncio.to_thread` 调用)：
1. 创建 tmux session：`tmux new-session -d -s xy-{id}`
2. 设置 CWD 为项目路径（或 worktree 路径）
3. 发送 Claude 命令
4. 返回 pane_id

### 2.4 TUI 就绪检测

启动后，`_launch_tmux_background` 后台任务执行两阶段检测：

**阶段 1**：检测 Claude 进程是否出现在 tmux pane 中（轮询 `tmux list-panes` + `/proc/PID` 树，每 200ms，最多 30s）

**阶段 2**：检测 TUI REPL 是否完全加载。关键检测信号：
- 有 `--dangerously-skip-permissions`：`"⏵⏵ bypass ... shift+tab"`
- 无 skip_permissions：`"? for shortcuts ... /effort"`
- 同时自动处理项目信任对话框（检测 `"trust this folder"` 并按 Enter）

### 2.5 预检步骤

在启动 Claude 之前执行 `_preflight_claude_project`（line 671/842），它：
1. 自动完成 `~/.claude.json` 中的全局 onboarding 和 project trust
2. 自动批准 hooks trust
3. 自动批准 CLAUDE.md external includes
4. 自动完成 project onboarding

这确保 Claude 不会因为首次启动对话框而阻塞 TUI。

---

## 3. 模型处理

### 3.1 模型列表定义

**后端**（`orchestrator/config.py`，line 36-42）：
```python
VALID_MODELS = {
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
}
```

**前端**（`frontend/src/lib/constants.js`，line 46-52）：
```javascript
export const MODEL_OPTIONS = [
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
```

两者**手动保持同步**。配置注释写明：`# Valid model names — keep in sync with frontend MODEL_OPTIONS`。

**模型名称显示函数**（前端 `modelDisplayName`）：
```javascript
export function modelDisplayName(modelId) {
  if (!modelId) return null;
  const opt = MODEL_OPTIONS.find((m) => m.value === modelId);
  if (opt) return opt.label;
  // Fallback: strip "claude-" prefix and date suffixes
  return modelId.replace(/^claude-/, "").replace(/-\d{8}$/, "")
    .split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
```

### 3.2 是否通过 --model 传递，还是 post-hoc 检测？

**两者都有，但主要依赖 `--model` 传递。**

启动时，模型通过 `--model` 命令行参数传递给 Claude CLI：
```python
if agent_model:
    cmd_parts += ["--model", _model_for_cli(agent_model)]
```

但是存在一个特殊的别名转换机制（`routers/agents.py` line 54-61）：
```python
_MODEL_TO_ALIAS = {
    "claude-opus-4-6": "opus",
    "claude-sonnet-4-6": "sonnet",
}

def _model_for_cli(model: str) -> str:
    """Use alias for 1M-capable models so ANTHROPIC_DEFAULT_*_MODEL env var takes effect."""
    return _MODEL_TO_ALIAS.get(model, model)
```

**目的**：对 claude-opus-4-6 和 claude-sonnet-4-6 使用别名（`opus`/`sonnet`），这样 `ANTHROPIC_DEFAULT_*_MODEL` 环境变量可以生效，允许通过环境变量指定具体的 1M-capable 版本。其他模型（opus-4-8、sonnet-4-6 的标准版等）则直接传递完整 ID。

### 3.3 模型存储与持久化（数据库 Schema）

**Agent 表**（`orchestrator/models.py` line 129）：
```python
model: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

**Task 表**（line 86）：
```python
model: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

**Project 表**（line 233-234）：
```python
default_model: Mapped[str] = mapped_column(String(100), default="claude-opus-4-8")
```

**CCSession 表**（line 477）：
```python
model: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

存储位置：`data/orchestrator.db`（由 `config.py` DB_PATH 配置）。

### 3.4 模型切换机制

**Xylocopa 没有运行时模型切换功能**。模型在 agent 创建时确定并存储在 `Agent.model` 字段中。现有 agent 无法通过 API 或 UI 更改其模型。

如果 agent 需要不同模型，必须：
1. 停止当前 agent
2. 创建一个新 agent，指定不同的模型

模型解析优先级（创建 agent 时）：
```python
# create_agent route (line 560)
agent_model = body.model or project.default_model or CC_MODEL
```

即：**用户显式指定 > 项目默认 > 全局默认**。

此外，在 session 导入时（`import_session_history`），会通过解析 JSONL 文件的首条 assistant 消息检测实际使用的模型：
```python
def _parse_session_model(jsonl_path: str) -> str | None:
    """Extract the model from the first assistant message in a session JSONL."""
    # Reads first assistant message, extracts .message.model field
```

### 3.5 模型选择器 UI

模型选择器组件 `ModelSelector`（`frontend/src/components/ModelSelector.jsx`）存在但**使用范围很窄**：

1. **NewTaskPage**：在创建任务时有一个下拉选择器（内联实现，不直接复用 ModelSelector 组件，而是用 `MODEL_PICKER = MODEL_OPTIONS.map(...)` 自行映射）
2. **QueueCard**：在 inbox 队列卡片中允许用户修改待执行任务的模型
3. **InboxCard**：允许修改 inbox 条目的模型

**AgentChatPage 和 ProjectDetailPage 没有模型选择器**——agent 一旦创建，模型固定。

---

## 4. 权限模式处理

### 4.1 使用的是 `--dangerously-skip-permissions`

**Xylocopa 只使用 `--dangerously-skip-permissions`**，不使用 `--permission-mode`。

在三个 CLI 启动路径中，均使用相同的模式：
```python
if body.skip_permissions:
    cmd_parts.append("--dangerously-skip-permissions")
```

当 `skip_permissions=False` 时，Claude CLI 使用其默认的交互式权限审批（显示 Allow/Deny 对话框）。

### 4.2 权限系统架构

Xylocopa 有一套完整的**内存权限管理器**（`orchestrator/permissions.py`）：

```python
class PermissionManager:
    """Manages pending tool-permission requests and per-agent session rules."""
    
    def __init__(self):
        self._pending: dict[str, PermissionRequest] = {}     # request_id → request
        self._always_allow: dict[str, set[str]] = {}         # agent_id → {"Bash", "Edit", ...}
```

**自动放行的安全工具**（`SAFE_TOOLS`）：
```python
SAFE_TOOLS = frozenset({
    "Read", "Glob", "Grep", "WebSearch", "WebFetch",
    "TodoRead", "Task", "TaskOutput",
})
```

**权限工作流程**：

1. Claude CLI 的 `PreToolUse` hook 调用 `POST /api/hooks/agent-permission`
2. Hook handler 检查工具是否在 `SAFE_TOOLS` 中 → 自动放行
3. 检查 agent 是否在 `PermissionManager._always_allow` 中 → 自动放行
4. 否则，创建 `PermissionRequest`（含 `asyncio.Event`），推送到前端
5. 用户通过 `POST /api/agents/{agent_id}/permission/{request_id}/respond` 审批
6. `PermissionManager.respond()` 设置 decision 并触发 event，解除 hook handler 的阻塞

**PermissionRequest 数据结构**：
```python
@dataclass
class PermissionRequest:
    id: str
    agent_id: str
    tool_name: str
    tool_input: dict
    summary: str
    tool_use_id: str
    created_at: float
    event: asyncio.Event  # 阻塞/解除钩子的关键
    decision: str | None   # "allow" / "deny"
    reason: str | None
    updated_input: dict | None  # AskUserQuestion 答案
```

### 4.3 还有安全 Hook

即使使用了 `--dangerously-skip-permissions`，Xylocopa 还有一个**本地安全 hook**（`hooks/pretooluse-safety.py`），硬编码阻止以下操作：
- `rm -rf`（任何包含 r 和 f 标志的组合）
- `git push --force` / `-f`
- `git reset --hard`（worktree 外不允许）
- `git clean -f`, `git checkout -- .`, `git restore .`
- `DROP TABLE` / `TRUNCATE`（不区分大小写）
- `Write` / `Edit` 到 `cwd` 外的路径

### 4.4 前端是否有权限模式下拉框？

**没有专门的权限模式下拉框**。`skip_permissions` 是一个布尔值：
- 在 **NewTaskPage** 中，有一个 "Auto" 开关（本质上是 `skip_permissions` 复选框）
- 在 **QueueCard** 中，有 `skip_permissions` 切换器
- 在 **create_agent** 和 **launch_tmux_agent** API 中，默认 `skip_permissions=True`

**没有 "Supervised/Auto" 的三级选择**（如 PermissionMode枚举），只有布尔值。

### 4.5 持久化

`skip_permissions` 存储在 **Agent 表**和 **Task 表**的 Boolean 列中：

```python
# Agent table
skip_permissions: Mapped[bool] = mapped_column(Boolean, default=True)

# Task table
skip_permissions: Mapped[bool] = mapped_column(Boolean, default=True)
```

PermissionManager 本身是**纯内存的**，没有持久化到数据库。agent 停止时自动清理：
```python
def clear_agent(self, agent_id: str):
    """Remove all rules and deny pending requests for a stopped agent."""
    self._always_allow.pop(agent_id, None)
    # Deny any pending requests
```

---

## 5. 会话初始化流程

### 5.1 完整步骤（Agent 创建到 CLI 运行）

以下是 `POST /api/agents` 路径的逐步流程：

```
Step 1: 请求到达
  POST /api/agents
  body: { project, prompt, model?, effort?, worktree?, skip_permissions }

Step 2: 项目验证 & 容量检查
  - 获取 Project 记录
  - 检查是否已归档
  - _check_project_capacity(db, body.project)
  - 生成 agent 名称（prompt 前 50 字符）
  - 解析模型：body.model || project.default_model || CC_MODEL

Step 3: tmux session 命名 & 碰撞检测
  tmux_session = f"xy-{agent_id[:8]}"
  tmux list-sessions 检查碰撞

Step 4: 预生成 session UUID 并写入 .owner sidecar
  pre_session_id = str(uuid4())
  write {project_session_dir}/{pre_session_id}.owner  ← 此时 Claude 尚未启动！

Step 5: 预检 Claude 项目
  _preflight_claude_project(project.path)  ← 自动批准所有对话框

Step 6: 构建 Claude CLI 命令
  claude --session-id <uuid> --output-format stream-json --verbose
    [--dangerously-skip-permissions]
    [--model <model>]
    [--effort <level>]
    [--worktree <name>]

Step 7: 创建 tmux session
  _create_tmux_claude_session(tmux_session, project_path, claude_cmd, agent_id)
  → 返回 pane_id（如 "#3"）
  agent.tmux_pane = pane_id

Step 8: 提交 Agent 记录到 DB
  Agent(id=agent_id, project, name, model, status=STARTING,
        tmux_pane=pane_id, skip_permissions=...)

Step 9: 启动后台 launch 任务
  _launch_tmux_background(agent_id, pane_id, prompt_future, project_path,
                          pre_session_id=pre_session_id)

Step 10: 在后台任务中
  a) 轮询检测 Claude 进程出现在 tmux pane 中（每 200ms，最多 30s）
  b) 检测 TUI REPL 就绪（status bar 特征字符串）
  c) 自动处理项目信任对话框
  d) 等待 TUI 额外 settle 时间（_TUI_SETTLE_DELAY）

Step 11: 发送用户 prompt 到 tmux
  send_tmux_message(pane_id, prompt)
  → 清除输入行（End + C-u）
  → 短消息：tmux send-keys -l -- <text>
  → 长消息：load-buffer + paste-buffer + Enter

Step 12: 等待 SessionStart hook 信号
  SessionStart hook（安装在 ~/.claude/settings.json）→ POST /api/hooks/agent-session-start
  → 写入信号文件 → _launch_tmux_background 读取 → hook_future.set_result(session_id)

Step 13: 开始 live sync
  agent_dispatcher.start_session_sync(agent_id, session_id, project_path)
  → 写入 .owner sidecar
  → 启动 _sync_session_loop 后台协程
  → 开始从 JSONL 增量同步消息到 DB 和 display 文件
```

### 5.5 关键值传递

| 值 | 传递时机 | 存储位置 |
|----|----------|----------|
| `model` | CLI 启动参数 + Agent 记录 | `--model` flag + `agents.model` column |
| `skip_permissions` | CLI 启动参数 + Agent 记录 | `--dangerously-skip-permissions` flag + `agents.skip_permissions` |
| `effort` | CLI 启动参数 | `--effort` flag（不在 Agent 记录中持久化） |
| `worktree` | CLI 启动参数 + Agent 记录 | `--worktree` flag + `agents.worktree` column |
| `session_id` | SessionStart hook 后 | `agents.session_id` column |
| `tmux_pane` | tmux 创建后 | `agents.tmux_pane` column |

---

## 6. 数据持久化

### 6.1 数据库

- **引擎**：SQLite（通过 SQLAlchemy ORM）
- **路径**：`data/orchestrator.db`（默认，可通过 `DB_PATH` 环境变量覆盖）
- **初始化**：`main.py` lifespan 中调用 `init_db()`

### 6.2 关键表结构

**agents 表** — agent 核心状态：
| 列 | 类型 | 说明 |
|----|------|------|
| id | String(12) | 主键，hex[:12] |
| project | String(100) | 所属项目 |
| name | String(200) | 显示名称 |
| model | String(100) | 使用的 Claude 模型 |
| mode | Enum | AUTO / INTERVIEW |
| status | Enum | STARTING / IDLE / EXECUTING / ERROR / STOPPED |
| session_id | String(100) | Claude session UUID |
| tmux_pane | String(100) | tmux pane 标识 |
| skip_permissions | Boolean | 是否跳过权限审批 |
| sync_last_offset | Integer | JSONL 同步字节偏移量 |
| sync_last_turn_count | Integer | JSONL 同步轮次计数 |
| sync_last_content_hash | String(64) | 内容哈希，检测 compact/rotation |
| context_total / context_limit / context_percent | Integer/Integer/Float | 上下文窗口使用量 |

**messages 表** — 消息记录：
| 列 | 类型 | 说明 |
|----|------|------|
| id | String(12) | 主键 |
| agent_id | String(12) | 外键 → agents |
| role | Enum | USER / AGENT / SYSTEM |
| content | Text | 消息内容 |
| status | Enum | SENT / EXECUTING / COMPLETED / FAILED / CANCELLED |
| stream_log | Text | 流式日志 |
| source | String(20) | "web" / "cli" / None |
| jsonl_uuid | String(50) | JSONL 条目的 UUID，用于去重 |
| meta_json | Text | 交互数据（AskUserQuestion, permission_prompt 等） |
| tool_use_id | String(100) | 工具调用 ID |
| session_seq | Integer | JSONL 中的序列号 |
| kind | String(20) | "text" / "tool_use" / None |
| display_seq | Integer | display 文件中的序列号 |

**projects 表** — 项目配置：
| 列 | 类型 | 说明 |
|----|------|------|
| name | String(100) | 主键 |
| display_name | String(200) | 显示名称 |
| path | String(500) | 本地路径 |
| default_model | String(100) | 默认模型（"claude-opus-4-8"） |
| max_concurrent | Integer | 最大并发 agent 数 |

**tasks 表** — 任务（第一类实体）：
| 列 | 类型 | 说明 |
|----|------|------|
| id | String(12) | 主键 |
| title | String(300) | 标题 |
| status | Enum | INBOX / PLANNING / PENDING / EXECUTING / ... |
| model | String(100) | 使用的模型 |
| skip_permissions | Boolean | 是否跳过权限 |
| agent_id | String(12) | 分配的 agent |

**cc_sessions 表** — Claude Code 原始 session 追踪：
| 列 | 类型 | 说明 |
|----|------|------|
| session_id | String(50) | 主键 |
| agent_id | String(12) | 所属 agent |
| parent_session_id | String(50) | 父 session（Task tool 子 session） |
| model | String(100) | session 使用的模型 |
| total_input_tokens | Integer | 累计输入 tokens |
| turn_count | Integer | 轮次计数 |

### 6.3 其他存储

- **Display 文件**：`data/display/{agent_id}.jsonl` — 每 agent一个 JSONL
- **Session JSONL**：`~/.claude/projects/<encoded>/<session_id>.jsonl` — Claude Code 原始输出
- **Session .owner**：`{project_session_dir}/{session_id}.owner` — 所有权 sidecar
- **Hooks 配置**：`~/.claude/settings.json`（全局 SessionStart hook）+ `{project}/CLAUDE.md`（项目级 hooks）

---

## 7. 消息同步管线

这是 Xylocopa 架构中最核心的部分。消息通过**四层管道**流动：

```
Layer 1: JSONL (source of truth)        Layer 3: Display file
  ~/.claude/projects/                      data/display/{agent_id}.jsonl
  <proj>/<session>.jsonl
         │                                    ▲
         │ Claude Code 写入                    │ display_writer.flush_agent()
         ▼                                    │
Layer 2: DB (parsed messages)                │
  SQLite messages table                      │
         │                                    │
         │ sync_engine.sync_import_new_turns()│
         ▼                                    │
   Agent.last_turn_count ─────────────────────┘
         │  pointer-based incremental sync
         ▼
   sync_last_offset (persisted for restart resume)
```

### 7.1 Layer 1：JSONL 源文件

Claude Code 写入 `~/.claude/projects/<encoded>/<session_id>.jsonl`。

**关键规则**：永远不直接编辑此文件。

### 7.2 Layer 2：DB 解析消息

**sync_engine.py** 通过 `sync_import_new_turns()` 将 JSONL turn 增量导入 DB。

**入口点**：
- `sync_import_new_turns` — 唯一的 JSONL→message 创建路径
- `sync_full_scan` — 只读审计，不创建/更新常规消息
- `trigger_sync` — 公共唤醒入口

**增量指针**：`Agent.last_turn_count`（持久化在 DB 中，重启后从中断处恢复）。

**三种消息类型**由内部 helpers 创建：
- `_promote_or_create_user_msg` → USER 消息
- `_create_agent_msg` → AGENT 消息
- `_create_system_msg` → SYSTEM 消息

**例外**：权限请求/审批卡片直接在 `routers/hooks.py` 中创建 `Message(role=AGENT)`，不经过 JSONL 路径。

### 7.3 Layer 3：Display 文件

`display_writer.py` 写入 per-agent JSONL 文件 `data/display/{agent_id}.jsonl`。

**关键设计**：
- 文件写入**在 DB 提交之前**发生
- append-only，按 `Message.display_seq` 排序
- 如果 DB 失败，`display_seq` 为 NULL，下次 flush 重试

**公共 API**：
- `flush_agent` — 追加未显示的消息
- `update_last` — 追加替换行（流式更新）
- `rebuild_agent` — 重置 display_seq，截断并重新刷新全部
- `delete_agent` — 删除文件

### 7.4 Layer 4：WebUI 读取

**GET /api/agents/{agent_id}/display** (`routers/agents.py:2379`) 以 `offset`/`tailBytes` 参数流式传输 display 文件。

**前端** `fetchDisplay(agentId, ...)` (`frontend/src/lib/api.js:290`) 在 `AgentChatPage.jsx` 中调用。

**WebSocket 仅用于信号**（"agent X 有变化了"），聊天内容**永远不作为 WS 载荷推送**，而是始终重新从 display 文件获取。

### 7.5 Sync 管线不变性（critical invariants）

1. **`wake_sync` 是唯一的 content-sync 入口点**。所有 hook 都通过 `AgentDispatcher.wake_sync(agent_id)` 唤醒，hook 本身只 `wake_sync`，从不直接写 JSONL-sourced 消息。

2. **增量、基于指针——且指针是持久化的**。`Agent.sync_last_offset` 和 `Agent.sync_last_turn_count` 在每次 tick 后写回 DB。重启后从最后一个同步的 turn 恢复，而不是重放整个历史。

3. **Display 文件是 DB 的下流，前端是 display 文件的下流**。不能短路任一环节。

4. **WebSocket 只是信号**。7 种 chat-message WS 事件（`pre_sent_created`, `message_executed` 等）不携带 payload——前端收到信号后重新 fetch display 文件尾部。

### 7.6 启动恢复

启动时不重建 display 文件（注释明确写道）。Display 文件是 DB 状态的追加镜像，由写入路径维护一致。重建仅保留给 compact（sync_engine）和 session rotation（agent_dispatcher）路径。

---

## 8. 关键架构决策和不变性

### 8.1 CLAUDE.md / ARCHITECTURE.md 中记录的决策

1. **Worktree session 解析**：必须使用 `_resolve_session_jsonl()`，裸 `session_source_dir()` 会错过 worktree 特定的路径。

2. **tmux pane 匹配**：`xy-{agent_id[:8]}` 是权威会话名。旧格式 `ah-{agent_id[:8]}` 仍被识别用于升级兼容。

3. **CWD → 项目匹配**：使用 `cwd == proj or cwd.startswith(proj + "/")`，平级 `==` 会错过 worktree 子目录。

4. **SQLAlchemy `metadata` 是保留字**：必须使用显式列名：`meta_json: Mapped[str | None] = mapped_column("metadata", Text, nullable=True)`。

5. **排队消息用 stop-hook 分发**：PENDING 在 DB → stop hook 触发 → 通过 tmux 发送 → UserPromptSubmit 确认投递。

6. **实时 UI 走三条独立路径**：(1) WebSocket 推送（信号）、(2) 5s 轮询列表、(3) 突变后的 caller-side 反馈。诊断延迟问题时必须检查全部三条。

7. **Don't name tmux sessions with `xy-` or `ah-` prefix**。用户创建的 tmux session 会被错误认领。

### 8.2 核心架构不变性

- **所有 agent 必须是 tmux-managed**，没有子进程分发路径
- **SessionStart hook 是强制基础设施**——xylocopa 在启动时安装到 `~/.claude/settings.json`，检测所有 claude 进程（包括它自己没启动的）
- **Display 文件是前端唯一的聊天数据源**，DB 和 JSONL 都不直接服务于前端
- **PreToolUse 安全 hook 强制执行**，即使 agent 使用 `--dangerously-skip-permissions`
- **SQLite 是唯一的持久化存储**，没有外部数据库

### 8.3 Session 检测与认领

启动时，`_write_global_session_hook()` 在 `~/.claude/settings.json` 安装全局 SessionStart hook。当任何 Claude Code 进程启动时（无论是否由 xylocopa 启动），它都会 POST 到 `/api/hooks/agent-session-start`，让 xylocopa 发现并认领它。

---

## 9. 与自身（agents-remote）和 hapi 的对比

### 9.1 Xylocopa vs 自身当前方案

| 维度 | Xylocopa | 自身当前方案 |
|------|----------|-------------|
| **CLI 启动方式** | tmux pane（所有 agent 都 tmux-managed） | 混合：tmux + 可能子进程 |
| **CLI 参数传递** | `--model`, `--dangerously-skip-permissions` 在启动时传递 | 可能通过环境变量或配置文件 |
| **模型列表** | 硬编码在 config.py + constants.js，手动同步 | 待确认 |
| **模型检测** | 启动时通过 `--model` 传递 + JSONL post-hoc 解析检测实际模型 | 待确认 |
| **权限模式** | 仅 `--dangerously-skip-permissions` 布尔开关 + 内存 PermissionManager | 待确认 |
| **会话发现** | 全局 SessionStart hook + tmux pane 映射 | 待确认 |
| **消息同步** | 四层管线：JSONL → DB → display file → WebUI | 待确认 |
| **WebSocket** | 仅信号，聊天内容永不推送 | 待确认 |
| **数据库** | 纯 SQLite（一个 DB 文件） | 待确认 |
| **模型别名** | opus-4-6 → "opus"，sonnet-4-6 → "sonnet"（让 ANTHROPIC_DEFAULT_*_MODEL 生效） | 待确认 |
| **前端** | React 19 + Vite + Tailwind，PWA 支持 | 待确认 |

### 9.2 Xylocopa vs hapi

| 维度 | Xylocopa | hapi |
|------|----------|------|
| **定位** | 多 agent 编排系统 | 待确认 |
| **CLI 集成** | tmux + session 管理 + TUI 就绪检测 | 待确认 |
| **权限模型** | 内存 PermissionManager + 安全 hook + dangerously-skip-permissions | 待确认 |
| **消息管线** | 四层管线 + display 文件 + pointer-based sync | 待确认 |
| **模型支持** | 5 个模型（opus-4-8/4-7/4-6, sonnet-4-6, haiku-4-5） | 待确认 |
| **持久化** | SQLite | 待确认 |
| **认证** | JWT + password hash | 待确认 |

### 9.3 值得关注的差异点

1. **Xylocopa 没有运行时模型切换**。模型在 agent 创建时固定，不能中途改变。如果我们的方案支持运行时模型切换，这是一个功能差异。

2. **Xylocopa 的 `--model` 别名机制**（opus-4-6 → "opus"）是一个独特设计，目的是让 `ANTHROPIC_DEFAULT_*_MODEL` 环境变量生效。

3. **Xylocopa 的 `skip_permissions` 默认值是 `True`**（自动模式），而大多数系统的默认值通常是交互式（需要审批）。

4. **Xylocopa 的消息管线是完全异步的**——display 文件在 DB 提交前写入，利用 `fcntl.flock` 防止多进程交错。

5. **Xylocopa 的 SessionStart hook 机制**允许发现用户手动启动的 Claude Code session（非 xylocopa 管理的），这是一个独特的 auto-discovery 设计。

6. **Xylocopa 使用 stream-json 输出格式**，Claude Code 同时写入 JSONL（持久化）和 stream-json（供解析）。这与直接解析 JSONL 不同。

---

## 附录：关键文件索引

| 文件 | 角色 |
|------|------|
| `orchestrator/config.py` | 配置（VALID_MODELS, CLAUDE_BIN, CC_MODEL, DB_PATH） |
| `orchestrator/models.py` | SQLAlchemy ORM 模型 |
| `orchestrator/schemas.py` | Pydantic 请求/响应模型 |
| `orchestrator/main.py` | FastAPI 入口 + lifespan |
| `orchestrator/agent_dispatcher.py` | Agent 生命周期：tmux 启动、同步循环、通知 |
| `orchestrator/permissions.py` | 内存权限管理器 |
| `orchestrator/display_writer.py` | DB → display 文件写入 |
| `orchestrator/routers/agents.py` | Agent CRUD、CLI 启动、权限审批 API |
| `orchestrator/routers/hooks.py` | Claude Code hooks 端点 |
| `frontend/src/lib/constants.js` | MODEL_OPTIONS、状态颜色等常量 |
| `frontend/src/components/ModelSelector.jsx` | 模型选择器组件 |
| `frontend/src/pages/NewTaskPage.jsx` | 新建任务页（含模型选择） |
| `frontend/src/components/cards/QueueCard.jsx` | 队列卡片（含模型和权限切换） |
| `docs/ARCHITECTURE.md` | 架构文档 |
| `CLAUDE.md` | 项目规范和不变性 |
