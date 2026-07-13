# Claude CLI 运行态三维度对接：model / permission / effort

> 配套文档：stream-json 协议本身（消息类型、control_request 机制）见 [claude-cli-stream-protocol.md](./claude-cli-stream-protocol.md)。本文专注"如何控制 CLI 的三个运行态维度"。

## 为什么单独成文

`model` / `permission` / `effort` 是 Claude CLI 的三个**运行态可调维度**。它们在交互式 TUI 里各有 UI（model picker、permission mode 切换、`/effort` slider），但 **stream-json 无头模式只覆盖了一部分**——`model`/`permission` 有进程内 `control_request`，`effort` 没有，且 `/effort` slash 在 headless 下不可用。

这意味着 agents-remote（直拉官方二进制、stream-json 交互）**必须针对每个维度单独设计对接**，不能假设 stream-json 协议覆盖了全部。本文对每个维度回答三个统一问题：

- **Q1**：不设置时默认值是什么、有哪些、从何而来（完整默认决策链）
- **Q2**：如何在 spawn CLI 时设定初始值
- **Q3**：如何在运行时（stream-json 交互过程中）动态更改这个值

## TUI vs stream-json 能力差异总览

| 维度 | TUI（交互式） | stream-json（无头） | agents-remote 对接现状 |
|---|---|---|---|
| **model** | model picker | `control_request{subtype:"set_model"}` ✅ | **已实现**（spawn `--model` + 运行时 `set_model`） |
| **permission** | mode 切换 | `control_request{subtype:"set_permission_mode"}` ✅ | **已实现**（spawn `--permission-mode` + 运行时 `set_permission_mode`） |
| **effort** | `/effort` slider | ❌ 无 `control_request`；`/effort` 在 headless 下不可用 | **已实现**（spawn env + 运行时重拉+resume；非进程内切换） |

> 结论：model/permission 是"stream-json 原生支持"，对接干净；effort 是"TUI 能力未透出到 stream-json"，对接需要额外手段（重拉或 fork）。

## 三维度 × 三问题对照总表

| 维度 | Q1 默认决策链（高 → 低优先级） | Q2 启动初始值 | Q3 运行时切换 |
|---|---|---|---|
| **model** | managed policy > `ANTHROPIC_MODEL` env > `--model` flag > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json` > 内置动态默认 | `--model <tier>` flag；1M 上下文用模型 ID 后缀 `[1m]`（如 `claude-opus-4-8[1m]`，底层 beta header `context-1m-2025-08-07`） | `control_request{subtype:"set_model"}`（进程内，回 `control_response`） |
| **permission** | `permissions.defaultMode` + `allow/ask/deny` 规则；评估顺序 deny→ask→allow→defaultMode；项目设置覆盖用户设置 | `--permission-mode <mode>` flag | `control_request{subtype:"set_permission_mode"}`（进程内，回 `control_response` + echo `system.status`）；ExitPlanMode 经 `control_response` 的 `permission_updates` |
| **effort** | `/effort` 当前值 > `CLAUDE_CODE_EFFORT_LEVEL` env > `effortLevel` 设置 > 模型内置默认（Opus 4.8→high，Opus 4.7 可用 xhigh） | `CLAUDE_CODE_EFFORT_LEVEL` env（最可靠）或 `--effort <level>` flag | **无可用进程内通道**；只能 **重拉 CLI**（新 env + `--resume`）或 **fork 加 RPC**（hapi 方案） |

---

## model

### Q1 默认值从何而来

决策链（高 → 低优先级）：

1. **managed policy**（企业/团队强制策略，最高优先）
2. **`ANTHROPIC_MODEL` 环境变量**
3. **`--model` flag**
4. 项目 `.claude/settings.local.json` 的 `model`
5. 项目 `.claude/settings.json` 的 `model`
6. 用户 `~/.claude/settings.json` 的 `model`
7. **内置动态默认**——会按账户能力/负载漂移，故"不设 = 当前最强可用模型"，不是固定常量

**1M 上下文**不是独立配置项，而是模型 ID 的 `[1m]` 后缀，CLI 展开为请求 beta header `context-1m-2025-08-07`。

### Q2 spawn 初始值

- argv `--model <tier>`；1M 上下文传 `--model claude-opus-4-8[1m]`。
- 或设 `ANTHROPIC_MODEL` 环境变量。
- **本项目已实现**：`spawnClaudeDirect`（`api/src/claude2-runtime.ts`）已从 `metadata.model` 注入 `--model`，并经 `session-registry.ts` 的 `setModel` 持久化到 metadata，`--resume` 重启时重新应用。

### Q3 运行时切换

`control_request{subtype:"set_model", model, request_id}` → CLI 进程内切换 → 回 `control_response{subtype:"success"|"error", request_id}`。进程不退出、relay 不重放历史。协议机制详见 [stream-json 协议 · 模型切换](./claude-cli-stream-protocol.md#模型切换)。

- **本项目已实现**：`switchModel`（前端 → WS → `claude2-stream.ts message()` → CLI stdin），按 `request_id` 匹配 pending action，success 应用新 model、error 回退 priorModel。
- 早期"杀进程重启 CLI + `switch_model_result`"的设计已废弃。

---

## permission

### Q1 默认值从何而来

- **`permissions.defaultMode`**：会话级默认模式，取值 `default` / `acceptEdits` / `plan` / `bypassPermissions`。
- **`permissions.allow` / `ask` / `deny` 规则列表**：每次工具调用按 **`deny → ask → allow → defaultMode`** 首条命中裁决。
- 规则声明位置：项目 `.claude/settings.json` 覆盖用户 `~/.claude/settings.json`。
- `--permission-mode` flag 只设 `defaultMode`，不改规则列表。

### Q2 spawn 初始值

- argv `--permission-mode <mode>`。
- **本项目已实现**：`spawnClaudeDirect` 已从 `metadata.permissionMode` 有条件注入 `--permission-mode`，并经 `setPermissionMode` 持久化到 metadata，`--resume` 重启时重新应用。

### Q3 运行时切换

`control_request{subtype:"set_permission_mode", mode, request_id}` → CLI 进程内切换 → 回 `control_response{subtype:"success"|"error", request_id}` + echo `system.status{permissionMode}`。协议机制详见 [stream-json 协议 · 权限模式切换](./claude-cli-stream-protocol.md#权限模式切换)。

- **本项目已实现**：`switchPermissionMode`，按 `request_id` 匹配，success 确认、error 回退 priorMode。
- **ExitPlanMode** 走另一条路：经 `control_response` 的 `permission_updates:[{type:"setMode", mode:"plan", destination:"session"}]`（非独立 control_request）。

---

## effort

> effort = 推理深度，CLI 请求 API 时的思考力度（`low/medium/high/xhigh/max`）。是三维度中**本项目唯一未接入**的，也是 stream-json 唯一**未原生支持运行时切换**的，单独详述。

### 取值

`low | medium | high | xhigh | max`（**5 档**，源自官方二进制 `/effort` 用法串 `Usage: /effort <low|medium|high|xhigh|max>`）。`auto`/缺省 = 让 CLI 自选（内部 null）。`ultrathink` 是提示词触发关键字（用户输入里出现 "ultrathink" 拉升到 max），**不是 `/effort` 的档位名**。

### Q1 默认值从何而来

漂移/动态。优先级（高 → 低）：

1. **`/effort` 斜杠当前值**（会话级，交互式 TUI 里设一次后对该会话持续生效）
2. **`CLAUDE_CODE_EFFORT_LEVEL` 环境变量**
3. **`effortLevel` 设置键**（`~/.claude/settings.json`）
4. **模型内置默认**：Opus 4.8 → `high`；Opus 4.7 可用 `xhigh`

### Q2 spawn 初始值

两个可靠的 spawn 通道：

1. **`CLAUDE_CODE_EFFORT_LEVEL=<level>` 环境变量**（**推荐**：持久、跨 `--resume` 重启仍生效，被 settings 层消费）。
2. **`--effort <level>` argv flag**（官方二进制字面量证实：`--effort <level>` + `Unknown --effort value '<X>'` + `.effort?["--effort",H.effort]:[]`）。
   - 或 `~/.claude/settings.json` 的 `effortLevel` 键（官方二进制 `effortLevel` 字面量 24 处）。

**本项目已实现**：`spawnClaudeDirect` 的 `Bun.spawn` 经 `buildSpawnEnv`（`claude2-runtime.ts:113-123`）注入 `CLAUDE_CODE_EFFORT_LEVEL`（`if (effort) env.CLAUDE_CODE_EFFORT_LEVEL = effort`）；effort 来自 `metadata.effort ?? 全局默认`（`ensureRunning` 读 `settingsStore` 解析），并经 `SessionRegistry.setEffort` 持久化到 metadata，`--resume` 重启时重新应用（对齐 model/permissionMode 的持久化模式）。

### Q3 运行时切换

**没有可用的进程内通道**——这是 effort 独有的限制，也是"本项目没有 effort 运行时切换"的根因。证据（官方 2.1.160 二进制字面量扫描 + 实测）：

- 21 种 `control_request` subtype **不含 `set_effort`**；`set_max_thinking_tokens` 是 **thinking token 硬上限（旧机制）≠ effort（自适应推理深度）**，二者不可混用。
- 官方二进制**无 `set_session_config` RPC**（那是 hapi fork 加的，见下），也**无公开 `setEffort` 标识符**（`getEffort` 字面量 16 处——CLI 读 effort，但不接受外部 set）。
- **`metadata.effort` per-user-message 通道未被证实**：二进制字面量扫描中 `metadata` 与 `effort` 无邻近共现；deepwiki 表述含糊；参考实现 hapi 从 SDK session 对象的 `getEffort()` 读 effort（`runClaude.ts:196`），**不是**从 `message.metadata.effort`。**不要假设此通道可用——实现前必须用真实 CLI 抓包验证。**
- **`/effort` 斜杠在 stream-json 下被解析，但因 headless 不可用**（实测：`--print` 与交互式 stream-json 两种都验证）：发 `/effort high` 的响应是 `model:"<synthetic>"`、`usage` 全 0、`num_turns:0`、`duration_api_ms:0` 的合成消息——**零 API 调用，证明 slash 被拦截解析**（若当文本发给模型必有真实 token 消耗）。但响应内容是 `/effort isn't available in this environment.`。二进制里 `% isn't available in this environment.` 是 `/effort`、local-jsx（`cmd_local_jsx_headless`）、Voice mode 等共用的通用模板——共同点是**需要交互式环境**；stream-json（stdin/stdout 是 pipe、非 TTY）被 CLI 判定为 headless，故这类命令一律不可用。**注意：slash command 与 `!bash` 前缀是两套独立机制，不要混为一谈**——`!` 是 bash 执行前缀、`/` 是内置命令系统，两者解析路径不同。

因此对**直拉官方二进制**的宿主（含本项目），运行时切 effort 的唯一可靠路径是 **重拉 CLI**：用新 `CLAUDE_CODE_EFFORT_LEVEL`（或 `--effort`）+ `--resume <sessionId>` 重启进程。代价：进行中的 turn 被打断（在 JSONL 里以 interrupted 呈现，属既有设计取舍）；历史由 `--resume` 完整恢复。

**本项目已实现（重拉 + resume，复用客户端自动重连）**：

```
客户端 switchEffort → WS 发 {type:"set_runtime_effort", effort}
  → claude2-stream.ts message()：
      ① sessionRegistry.setEffort(sessionId, effort)  // 持久化 metadata.effort
      ② claude2Runtime.close(runtimeKey)              // 杀 CLI + 销毁 relay（确保重连时 ensureRunning 走 respawn 而非 early-return）
      ③ close 该 session 全部 WS socket                // session→sockets 索引，多客户端同 session 一并重连
  → 客户端 socket.onclose (cancelled=false) → scheduleReconnect(500ms)
  → setConnectionVersion+1 → WS 重建 → open() → ensureRunning(metadata.effort)
  → spawnAndStart (--resume <claudeSessionId> + 新 CLAUDE_CODE_EFFORT_LEVEL env)
  → 新 relay 重读 JSONL + session_init{resume:true}（进行中 turn 天然标 interrupted）
```

关键点：① 复用既有客户端自动重连，**零新增重连代码**；② `runtime.close` 必须在 close socket 之前完成（杀进程 + 销毁 relay），否则重连的 `ensureRunning` 看到 relay 仍 in-flight 会 early-return 不 respawn；③ effort **无 stdout 信号**（`CLAUDE_CODE_EFFORT_LEVEL` 是 env-only），客户端切完靠 detail query invalidate 刷新显示（非流信号）；④ hapi 的 fork-RPC 即时方案（`set-session-config`）直拉派**无法复制**——这是直拉派的等价物，代价是中断当前 turn + 短暂重连。

### Effort 运行时切换的竞品方案

"网页控制 Claude" 类竞品解决运行时切 effort 的两条已知路径：

1. **Fork/包装 CLI + 自定义 RPC（hapi / tiann/hapi）**：hapi 维护自己的 CLI wrapper（`cli/src/claude/runClaude.ts`），注册了一个官方二进制所没有的 `set-session-config` RPC handler。链路：

   ```
   UI 按钮 → POST /sessions/:id/effort { effort }
     → engine.applySessionConfig → sessionRpc(sessionId, 'set-session-config', config)
     → handler: currentEffort = resolveEffort(config.effort); syncSessionModes()
     → sessionInstance.setEffort(currentEffort); loop({ effort: currentEffort }) 应用到后续 turn
     → 回 { applied: { permissionMode, model, effort } }
   ```

   - effort 状态保存在 SDK session 对象（`getEffort()`/`setEffort()`，`onUserMessage` 每条消息读一次，`runClaude.ts:187-203`），**不**走用户消息负载。
   - normalize（`cli/src/claude/effort.ts`）接受任意字符串 + `null`（=auto）；测试（`sessionModel.test.ts:160/164`）证实 `effort:'max'` 与 `effort:null` 均合法。
   - **代价**：必须维护 fork/SDK wrapper，不是直拉官方二进制。Codex 走另一条路（`--model-reasoning-effort` argv，`run.ts:936`）。
   - 源码：`~/repos/hapi` `cli/src/claude/runClaude.ts:170,177-186,387-407`、`cli/src/claude/session.ts:85`、`hub/src/web/routes/sessions.ts:396,419`。

2. **重拉官方二进制（直拉派，含本项目可走的路）**：任何包装官方二进制的宿主都能用——新 `CLAUDE_CODE_EFFORT_LEVEL` + `--resume` 重启。代价：进行中 turn 打断，历史由 `--resume` 保全。

---

## agents-remote 对接现状与后续方案

| 维度 | Q1（默认） | Q2（spawn） | Q3（运行时） | 后续 |
|---|---|---|---|---|
| **model** | 继承 CLI 决策链 | ✅ `--model` + metadata 持久化 | ✅ `set_model` control_request | — |
| **permission** | 继承 CLI 决策链 | ✅ `--permission-mode` + metadata 持久化 | ✅ `set_permission_mode` + ExitPlanMode `permission_updates` | — |
| **effort** | 继承 CLI 动态默认 | ✅ `CLAUDE_CODE_EFFORT_LEVEL` env + metadata 持久化 | ✅ 重拉 + resume（`setEffort` + `runtime.close` + close socket → 客户端自动重连 → `ensureRunning` respawn） | — |

**对本项目的结论**：直拉官方二进制（`Bun.spawn`，非 fork）意味着运行时切 effort 只能走"重拉 CLI"。Q2（spawn env）与 Q3（重拉切换）**均已实现**：

- **Q2 已落地**：`buildSpawnEnv` 注入 `CLAUDE_CODE_EFFORT_LEVEL`；`SessionMetadata` 有 `effort?` 字段；`setEffort` 持久化；`--resume` 重启时经 `ensureRunning` 重新应用。
- **Q3 已落地**：复用客户端自动重连——`set_runtime_effort` → `setEffort` + `runtime.close` + close 全部 socket → 重连 → `ensureRunning` respawn（`--resume` + 新 env）。代价：进行中 turn 打断（以 interrupted 呈现），历史由 `--resume` 保全。UI 对 running 态切换给明确重启提示。

**`metadata.effort` 通道（per-user-message 注入）仍不得实现**——它未被官方二进制字面量证实，且参考实现 hapi 也不走此路；本项目走 env + relaunch，不碰这条未证实通道。

---

## 证据来源

- **官方二进制字面量扫描**：`node_modules/.bun/@anthropic-ai+claude-code-linux-x64@2.1.160/.../claude`（242MB 编译 ELF，`rg -a` 扒字面量）——`set_effort` 不存在、`set_session_config` 不存在、`getEffort`×16、`effortLevel`×24、`CLAUDE_CODE_EFFORT_LEVEL`×14、`xhigh`×141、`/effort` 用法串、`disableSlashCommands` 默认 false、`cmd_local_jsx_headless` + `% isn't available in this environment.` 模板。
- **实测**：`spawn claude --input-format stream-json --output-format stream-json`，发 `/effort high`，对照 `--print` 与交互式两种——均回 synthetic 零调用响应 `/effort isn't available in this environment.`。
- **参考实现源码**：`~/repos/hapi`（tiann/hapi）`cli/src/claude/runClaude.ts`、`cli/src/claude/session.ts`、`cli/src/claude/effort.ts`、`hub/src/web/routes/sessions.ts`、`hub/src/sync/sessionModel.test.ts`。
- **deepwiki**：anthropics/claude-code（`/effort` 用法、`CLAUDE_EFFORT` hooks env、skill frontmatter effort、Opus 4.8 default high）、tiann/hapi（`set-session-config` RPC 全链路）。
