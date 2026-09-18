# ACP agent 接入调研

> 调研时间：2026-09-16。问题：支持 ACP（Agent Client Protocol，agentclientprotocol.com）协议的 agent 接入——竞品如何处理多种 code agent 接入（是否都收敛到 ACP）+ 本项目接入路径。
> 三路并行调研：① 当前主流竞品接入方式盘点 ② ACP 协议本体与 agent/client 生态 ③ buzz（本地 `~/repos/buzz`）ACP 客户端实现源码深挖（第一手工程经验）。
> 证据分级：【强】= 源码 / 官方文档 / 官方公告一手；【中】= 官网 FAQ / 作者一手发言 / 第三方 meta 报告；【弱】= 社区讨论 / 闭源推断。
> 承接 `agent-access-options.md`（早期接入路线调研，当时 ACP 未成气候未覆盖）。

## 调研状态

- 竞品盘点：完成（Vibe Kanban / Happy / OpenCode / Crush / omnara / Conductor / Terragon / Goose / Zed / Paseo + 云端 BYOA 群 + ACP 原生编排层）。
- 协议调研：完成（v1 stable + v2 draft + TS SDK + agent 端 41 条目录 + client 生态）。
- buzz 源码深挖：完成（`crates/buzz-acp` ~3.7 万行，协议怪癖 + 工程结构血泪清单）。
- LobeChat 补充调研：完成（非 ACP-first：旗舰走厂商原生协议，ACP 手写客户端只覆盖 5 家无 SDK 第三方；2026-09-18 deepwiki 补核实：code agent 与普通聊天**共享同一产品入口与聊天界面**，分叉只在 transport 层）。
- **接入规划：提案已给出（§6），Phase 1 已落地**（omp ACP provider + per-provider settings 凭据切片 + provider 平权，commit ee113f5）；Phase 3 模型/配置切换完成 omp 第一手核实并具体化（§6.5）。

## 1 核心结论（TL;DR）

1. **编排控制面层业界并未收敛到 ACP**：编排产品（Vibe Kanban/Happy/Paseo/Conductor）的 executor 核心仍是逐家 CLI wrapper；ACP 在这类产品中一致扮演「长尾通用后备管道」。深控制需求（resume/fork/权限流/会话文件）超出 ACP v1 覆盖。
2. **编辑器↔agent 层 ACP 已是事实标准**：官方目录 41 条 agent（Gemini/Copilot CLI/Cursor CLI/Kimi/Qwen/OpenCode/Goose…原生；Claude/Codex 走官方 adapter）、100+ client、TS/Rust SDK 1.0、Registry 上线、RFD 治理（Zed + JetBrains 联合）、v2 draft 在途。
3. **两个被多家独立复选的事实次标准**：Codex = `codex app-server` JSON-RPC（Vibe Kanban/Happy/Paseo 三家同选）；Claude = stream-json + hooks + `--resume` + JSONL（我们现行路线，业界完全同构）。
4. **本项目接 ACP 的最大架构优势**：ACP 是 stdio + spawn 子进程模型（client 管进程、agent 管持久化），与我们「服务器上直拉 CLI」场景天然匹配——remote transport 不 stable 对我们无影响；且 `session/load` 全量回放语义与现有 relay history/live 双缓冲设计同构，**前端渲染管线可零改动复用**（帧翻译在 runtime 层完成）。
5. **推荐路线**：新增第三条管道「ACP runtime」（通用 ACP provider，command 可配置），覆盖 Gemini/Qwen/Kimi/Copilot/Cursor/OpenCode 等长尾；Claude/Codex 维持现有原生管道不动。分三阶段：协议层 PoC（Gemini CLI）→ provider 化 + settings 预设 + resume → 深控制对齐（模型切换/权限 UI/usage/plan）。

## 2 竞品如何接入多种 code agent

### 2.1 接入矩阵（2026-09，全部核实）

| 产品 | 接入方式 | ACP 角色 | 状态 |
|---|---|---|---|
| **Vibe Kanban**（BloopAI） | 混合四管道（Rust `StandardCodingAgentExecutor` trait + enum dispatch）：Claude/Amp/Cursor/Droid=stdio JSON 流逐家 parser；Gemini/Copilot/Qwen=ACP（`AcpAgentHarness`）；Codex=`app-server` JSON-RPC；Opencode=HTTP SSE | **部分管道**（3/9 家） | 公司 2026-04 关停，OSS 续维护【强】 |
| **Happy**（slopus） | Claude=stream-json+hooks wrapper；Codex=`app-server` JSON-RPC；**通用后备=ACP（官方 `@agentclientprotocol/sdk`）** 接任意 ACP CLI | **通用后备管道** | 活跃，已入驻 ACP clients 列表【强】 |
| **Paseo**（getpaseo，2026 新星） | 双轨：direct provider 逐家 wrapper（Claude/Codex app-server/OpenCode/Pi）+ **ACP（Copilot 原生 + `config.json` 里 `extends:"acp"` + `command` 接任意 ACP agent）** | **双轨之通用轨** | 活跃，全平台 + 远程 daemon【强】 |
| **OpenCode**（sst） | 自家 agent 直调 LLM API；对外 `opencode acp` 作 **ACP server**（实现 new/load/resume/fork 全套） | server 侧 | 活跃，207k stars【强】 |
| **Crush**（charmbracelet） | 直调 LLM API（fantasy/catwalk），**明确不接 ACP**（最高赞 issue #990 挂一年未做） | 拒绝 | 活跃【强】 |
| **omnara** | 旧=Claude CLI wrapper；新=自有 Go 控制面直调模型 API（"open-source alt to Claude Managed Agents"） | 无 | 活跃【强】 |
| **Conductor**（闭源） | managed CLI executables（"harness"：Claude/Codex/OpenCode 内置打包）+ Cursor API；无通用后备 → 两年只支持 4 家 | 无 | 活跃【强】 |
| **Terragon** | 云端 CLI wrapper | 无 | **已关闭**（被第一方云面挤出）【强】 |
| **Goose**（Block） | 三层：25+ provider 直调 + MCP 扩展 + **ACP 双向**（server=`goose acp`；client 委托 Claude/Codex/Amp/Pi ACP adapter）。已捐 Linux Foundation 旗下 AAIF，**宣布以 ACP 统一架构** | 核心架构 | 活跃【强】 |
| **Zed** | ACP 发起方/参考 client（`acp_thread`/`agent_servers` crates）；ACP 管道接 Claude/Codex/OpenCode/Copilot/Cursor/Pi/Poolside/Gemini + Registry 任意 agent | 全部 | 活跃【强】 |
| **ACP 原生编排层** | Codeg / Jockey / tlbx / CompozyOS / Remote Agent Server（自托管 ACP 执行网关：Task API + workspace 隔离 + 持久 session + SSE）/ AionUi 等 30+；移动端 Happy/Agmente/Ferngeist/Shellular 等；消息桥十余个（Telegram/Discord/飞书/微信/QQ） | **全部**（+ stdio→HTTP/WS 社区桥） | 活跃【强】 |
| **云端 BYOA 群**（Tembo/Blocks/Nairi 等） | 云沙箱跑用户选的 CLI + 平台 Task/PR 层 | 无 | 闭源，"cloud coding agent platforms" 已成品类名【中】 |
| **第一方云面**（Claude Code Web/Codex Cloud/Cursor background） | 厂商云 API/自营 harness——定义了独立编排产品的价格天花板 | 无 | 【中】 |
| **LobeChat / lobehub** | 旗舰=Claude Agent SDK/stream-json + Codex app-server；ACP=手写 stdio JSON-RPC 只覆盖 5 家无 SDK 第三方（Cursor/Devin/Droid/Grok/TRAE） | 第三方后备 | 活跃，82.5k stars【强】 |

### 2.2 横向结论

**(a) 接入方式分布**（编排/控制面视角，n≈15）：

| 接入方式 | 产品 | 判断 |
|---|---|---|
| 逐家 CLI wrapper（JSON 流/SDK RPC） | Vibe Kanban、Happy、Paseo、Conductor、omnara(旧)、云端 BYOA 群 | **仍是编排后端主流** |
| ACP 作为（部分或全部）接入管道 | Zed、Goose、Vibe Kanban、Happy、Paseo、全部 ACP 原生编排层 | 编排产品普遍当「长尾覆盖管道」 |
| 直调 LLM API（自家 agent loop） | OpenCode、Crush、Goose、omnara(新) | 语义是「加模型」不是「加 agent CLI」 |
| 厂商云 API/第一方云面 | Claude Code Web、Codex Cloud、Cursor background | 在挤压独立编排产品 |
| PTY 纯透传 | 仅 tmux 系小工具 | 基本退出主流 |

**(b) ACP 收敛判断——分两层**：

1. **编辑器↔agent 层：已收敛为事实标准**。决定性信号是商业 CLI 主动 native 支持：Cursor CLI 原生 `acp`、Copilot CLI public preview（2026-01-28）、AWS Kiro、JetBrains Junie、Kimi CLI、Mistral Vibe——「agent 不再绑定自家宿主」成为共识。LSP 类比在此层成立。
2. **编排控制面后端层：未收敛**。编排产品需要 resume/fork/权限流/模型切换/会话文件深控制，ACP v1 覆盖不全（v2 在补）；各家 executor 核心仍逐家写。反向证据：Crush 至今明确不接。
3. **趋势**：Transports WG 在做 remote HTTP/WebSocket、session 生命周期方法全部 stabilize、ACP-native 控制面已出现（Remote Agent Server/CompozyOS/Codeg）；Goose 捐基金会并宣布以 ACP 统一、Zed 把 claude/codex adapter 收编进 agentclientprotocol org，是两个强收敛信号。**一句话：ACP = 编辑器侧事实标准 + 编排侧通用后备，不是（2026-09 还不是）编排产品的唯一协议。**

**(c) 新增一个 agent 的边际成本**：

| 路线 | 成本 |
|---|---|
| 纯 ACP client（Zed/Codeg/tlbx） | **≈0 行代码**（Registry 发现/配置一条 command） |
| 双轨产品（Happy/Paseo） | ACP agent=配置级（`extends:"acp"`）；非 ACP=每家数百行 wrapper |
| Vibe Kanban | 有 ACP 复用 harness=配置级；否则 1 个 Rust executor（数百行） |
| Conductor | 每家深度集成 → 两年只 4 家 |
| 直调 API（OpenCode/Crush） | 加 provider/model≈目录驱动近零，但语义不同 |

**(d) LobeChat / lobehub**（2026 rebrand，"Chief Agent Operator"，82.5k stars）：

- code agent 接入是 2026 上半年主线（`packages/heterogeneous-agents` "hetero agent" 体系）：Claude Code 走 `@anthropic-ai/claude-agent-sdk` + CLI stream-json、Codex 走 `codex exec` JSONL + **app-server JSON-RPC** 双路径、**ACP 是手写 stdio JSON-RPC 客户端**（`acpStdioClient.ts`，无官方 SDK 依赖）只覆盖 5 家无 SDK 的第三方 agent（Cursor/Devin/Droid/Grok Build/TRAE，每家一个 `*AcpSession.ts`）。
- **非 ACP-first**：旗舰走厂商原生协议，ACP 只是「无 SDK 第三方」的适配器之一；ACP 官网 clients 列表无 lobehub。
- 执行拓扑三处（Electron 本地 spawn / 云沙箱 / `lh` CLI 设备网关），`AgentStreamPipeline` 归一统一事件流——与我们路线高度同构。可借鉴：`ensureResumeTranscript.ts` 在本地 transcript 被 GC 后从自持消息重建再 resume。
- 【强】package.json/PR/目录清单一手。

## 3 ACP 协议要点

### 3.1 定位 / 治理 / transport

- 标准化「编辑器/IDE ↔ coding agent」通信，对标 LSP。**Client**（控制面）spawn **Agent**（被控方）子进程；一个连接多 session；JSON-RPC 2.0 **双向** RPC（agent 可反向调 client：权限/文件/终端/结构化输入）。
- 治理：**Zed + JetBrains 联合**（RFD 流程 + Working Groups + Lead Maintainer），走向独立基金会。
- **stdio 是当前唯一 stable transport**：NDJSON（换行分隔，消息内禁含换行）；agent 的 stdout 除 ACP 消息外不得有其他输出（logging 走 stderr）。Streamable HTTP/WebSocket 仍在 draft（社区桥接补位）。
- 约定：属性 key `camelCase`、discriminator 值 `snake_case`（如 `sessionUpdate: "agent_message_chunk"`）；**路径必须绝对、行号 1-based**；`_meta` 挂自定义元数据、`_` 前缀自定义方法；**未声明 capability 一律不支持**。

### 3.2 方法全集（v1 stable）

**Agent 端（client→agent）**：

| 方法 | 门槛 | 说明 |
|---|---|---|
| `initialize` | baseline | `protocolVersion`(int, 当前=1) + `clientCapabilities` + `clientInfo`；双向 capabilities 协商 |
| `authenticate` | 按需 | `{methodId}`；`terminal` 型 auth = client 另起交互终端让用户手动登录后重连 |
| `session/new` | baseline | `{cwd, mcpServers}` → `{sessionId, modes?, configOptions?}`；cwd 与 spawn cwd 无关 |
| `session/prompt` | baseline | `{sessionId, prompt: ContentBlock[]}` → `{stopReason}`（v1 响应即 turn 结束） |
| `session/load` | optional（`loadSession` cap） | **全量历史回放**（见 3.3） |
| `session/resume` | optional | 恢复**不回放**（2026-04 stable） |
| `session/list` / `close` / `delete` | optional | 发现/释放/删除（list 带分页 + `session_info_update` 推送） |
| `session/set_config_option` | optional | 切 mode/model/thought_level 等（`set_mode` 的泛化继任） |

**Client 端（agent→client 反向调用）**：

| 方法 | 说明 |
|---|---|
| `session/request_permission` | 工具授权：options[{optionId,name,kind}]，kind ∈ allow/reject × once/always；**必须应答否则 turn 卡死** |
| `fs/read_text_file` / `write_text_file` | 需广告 `fs` capability；不广告则 agent 自管文件（大多数 CLI agent 默认路径） |
| `terminal/create|output|wait_for_exit|kill|release` | 需广告 `terminal` capability |
| `elicitation/create` | 向用户要结构化输入（form）或引导 URL 交互 |

**通知**：`session/update`（流式总线，见 3.4）、`session/cancel`（client→agent）、`$/cancel_request`（请求级取消）。

StopReason（v1）：`end_turn` / `max_tokens` / `max_turn_requests` / `refusal` / `cancelled`。

### 3.3 Session 生命周期与恢复语义（重点）

- **恢复是协议一等场景，持久化责任在 agent 侧**：
  - `session/load`：agent **MUST 用 `session/update` 通知流把整段会话历史回放给 client**（user_message_chunk → agent_message_chunk → tool_call…），全部回放完才应答请求——支持跨进程重启、跨 client 实例共享会话。
  - `session/resume`：恢复上下文**不回放**（≈我们的纯 live 重连）；proxy/adapter 可在其上叠出 load 语义。
  - `session/list`：发现历史会话（只发现不恢复）。
- Session ID 是 `sess_xxx` 形态不透明字符串，agent 生成。
- **与本项目 message-replay 设计同构**：`session/load` 回放 ≈ 我们的 `history_start/historyLines` 段；`session/resume` 不回放 ≈ 纯 live 重连；差异是 ACP 把回放协议化，我们从 JSONL 文件自读。

### 3.4 session/update 流式变体（v1 全集）

| 变体 | 内容 |
|---|---|
| `user_message_chunk` / `agent_message_chunk` / `agent_thought_chunk` | 流式内容块；`messageId` 同 ID=同一消息（聚合分块用） |
| `tool_call` | 新工具调用：`toolCallId`/`title`/`kind`(read/edit/delete/move/search/execute/think/fetch/other)/`status`(pending/in_progress/completed/failed)/`content[]`/`locations[]`/`rawInput` |
| `tool_call_update` | 增量更新，只发改动字段 |
| `plan` | 任务清单 entries[{content, priority, status}] |
| `available_commands_update` | 广播 slash commands（`/xxx` 文本直通进 prompt，命令须占 prompt 第一个 block） |
| `current_mode_update` / `config_option_update` | agent 侧模式/配置变更通知 |
| `session_info_update` | title/updatedAt/_meta 元数据推送 |
| `usage_update` | 上下文用量 `{used,size}` + 可选 cost |

tool_call `content[]` 三形态：`content`（文本/图片/资源）、`diff`（path+oldText+newText，oldText=null=新建）、`terminal`（内嵌实时终端输出 terminalId）。

### 3.5 v2 draft（2026-07-20，摘要）

| 维度 | v1 | v2 |
|---|---|---|
| prompt 生命周期 | 响应挂起到 turn 结束带 stopReason | 响应=受理确认；进度/完成走 `state_update` 通知 |
| 更新语义 | tool_call 创建/update 分离 | **统一 upsert**（省略=不变/null=清除/值=替换/chunk=追加） |
| 会话恢复 | `load` + `resume` 两套 | 只剩 `resume` + `replayFrom` 游标 |
| Client fs/terminal | 保留 | **整体移除**——client 工具统一经 mcpServers 提供 |
| 权限/diff/MCP 配置 | — | 加 title/subject；changes[] 结构化 diff；MCP 配置必须 type discriminator |

定位：draft；**推荐 v1/v2 双栈并存、按连接协商**。对我们的含义：**先 pin v1 stable**（SDK 成熟、生态以 v1 为主），v2 落 stable 后再评估。

### 3.6 SDK

- TS：**`@agentclientprotocol/sdk` v1.4.0**（1.0 于 2026-06-25；旧 `@zed-industries/agent-client-protocol` 已 deprecated）。`ClientSideConnection` + `ndJsonStream`（经典 API）或新 fluent `client()` API；schema 驱动（Zod 运行时校验）；examples 含最小 client/http/ws。
- Rust `agent-client-protocol` 1.0（Zed 在用）；Python/Kotlin/Java 官方 + 12 门语言社区库。

## 4 Agent 端支持矩阵（要点）

| Agent | 接入方式 | session 恢复 | 成熟度 |
|---|---|---|---|
| **Gemini CLI** | **原生** `gemini --acp`（官方点名参考实现，`packages/cli/src/acp/` 测试齐全） | loadSession + ACP fs proxy | 高 |
| **Claude Code** | 官方 adapter `@agentclientprotocol/claude-agent-acp` v0.77.0（名字三跳：claude-code-acp→claude-agent-acp→agentclientprotocol org；日级活跃） | **load**（回放 `~/.claude/projects/*.jsonl`，与同源）/ unstable_resume/fork/list | 高 |
| **Codex CLI** | 官方 adapter `@agentclientprotocol/codex-acp` v1.11.0（包装 `codex app-server`；旧 zed 仓 2026-07 归档） | new/load/list/delete/**resume**/close 全套 + 进程重启持久化 e2e | 高 |
| **Copilot CLI** | 原生 `copilot --acp`（2026-01 public preview） | 未确认 | preview |
| **Cursor CLI** | 原生 `agent acp` | 未确认 | 高 |
| **Goose / Kimi CLI / Qwen Code / OpenCode / Junie / Devin / Augment / Kiro / Factory Droid / OpenHands / Mistral Vibe / GLM / CodeBuddy(腾讯) / Cortex Code(Snowflake) / xAI / Qoder** | 原生（官方目录 41 条） | GLM 明示 load+fork+resume 落盘；多数未逐一验证 | 长尾活跃 |
| Registry | `cdn.agentclientprotocol.com/registry/v1/latest/registry.json` 程序化拉取 ~35 条（含安装命令/版本） | — | 2026 stable |

## 5 客户端实现参考

### 5.1 官方 TS SDK 最小面（v1）

```typescript
import { spawn } from "node:child_process";
import * as acp from "@agentclientprotocol/sdk";

class MyClient implements acp.Client {
  async requestPermission(params) { return { outcome: { outcome: "selected", optionId: "allow-once" } }; }
  async sessionUpdate(n) { /* 唯一数据入口：全部 session/update 变体走这里 */ }
  async readTextFile(p) { return { content: "..." }; }
  async writeTextFile(p) { return {}; }
}

const proc = spawn("npx", ["-y", "@agentclientprotocol/claude-agent-acp"], { stdio: ["pipe", "pipe", "inherit"] });
const conn = new acp.ClientSideConnection(() => new MyClient(), acp.ndJsonStream(proc.stdin, proc.stdout));
await conn.initialize({ protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "agents-remote", version: "0.0.0" } });
const { sessionId } = await conn.newSession({ cwd: "/proj", mcpServers: [] });
// 恢复：agentCapabilities.loadSession ? conn.loadSession({sessionId, cwd, mcpServers}) : ...
const { stopReason } = await conn.prompt({ sessionId, prompt: [{ type: "text", text: "..." }] });
```

要点：**SDK 不负责 spawn**（示例用 `node:child_process`，Bun.spawn 同理）；turn 的 UI 进度全部从 `sessionUpdate` 回调驱动（与本项目「消息=state、渲染=投影」范式同构）；权限请求必须应答；fs/terminal 反向调用按需广告 capability。

### 5.2 buzz 第一手工程经验（`~/repos/buzz` crates/buzz-acp ~3.7 万行）

buzz-acp 是无人值守 ACP harness（接 goose/codex-acp/claude-agent-acp/hermes/自研 buzz-agent），手写 JSON-RPC NDJSON（未用官方 crate），客户端一侧工程血泪：

**协议怪癖（必须防御）**：

1. **字段漂移是常态，双向兼容读取、规范名写回**：`configId` vs `id`、`agentInfo` vs `serverInfo`、数字 vs 字符串 JSON-RPC id、`stopReason` 大小写（END_TURN/Cancelled）、`protocolVersion` 可能缺失（默认 1 降级）。
2. **绝不用错误码探测能力**：codex-acp 对未识别扩展方法回 `{}` 成功而非 -32601——靠试探调用会把「没投递」误读成「已投递」；必须 initialize 显式声明 + result 字段正向白名单。
3. **响应匹配防 id 撞车**：匹配 id 还要无 `method` 字段（带 method 的是 agent 的请求）；未识别的带 id 请求必须回 -32601，否则 agent 挂死。
4. **cancel 后部分 agent 继续输出**：有界 drain + 超时 respawn 兜底；drain 超时独立类型（不与 hard-cap 混淆）；cancel 前必须先补权限回复（否则 agent 卡在等权限应答）。
5. **session 级设置先对照 agent 自己广告的能力**：goose 对不认识的 `set_config_option` 值直接崩进程（查 `modes.availableModes` 再发）；Hermes 在响应 initialize 前启动全部配置的 MCP（启动预算可能耗尽，需 env 跳过 + initialize 限时 60s）。
6. **`_meta` 两层位置**：session/new 的自定义字段放顶层 `_meta`；session_info_update 的放 `params.update._meta`。**「省略 vs null」有语义**：可选 `_meta` 无值时整个省略。

**工程结构**：

7. **行读设上限**（buzz 10MB 防 OOM）、**写设超时**（agent 停止读 stdin 防挂死，30s）、非 prompt RPC 读写各限 60s。
8. **进程组击杀**：spawn 设 process group、退出 killpg——否则 MCP server/工具子进程泄漏成孤儿。Bun 可 `detached` + `process.kill(-pgid)`。
9. **双超时模型**（无人值守成熟形态）：idle timeout（任意 stdout 活动重置；tool_call 通知也要重置——静默工具是正常的）+ hard deadline（绝对墙钟）；hard 在事件循环 select **之前**预检查（否则高频流饿死定时器分支）。
10. **权限 fail-closed 三层**（无人值守）：优先 `set_config_option` 调到免询问模式（先验证 agent 广告了该模式）→ 仍有请求按 `kind=="reject_once"` 拒绝 → 没有则回 cancelled。我们有人类在环 UI，映射到现有 approvals 面即可，但「cancel 先补权限回复」「写成功后才置 responded 标志」（防双响应/死锁）两条仍然适用。
11. stderr 直接 inherit 到日志文件即可，无需单独收集协议。

### 5.3 明确不照搬的

- buzz 把 session/update 只打日志（无人值守）——我们需要完整消费翻译成前端帧，参考官方 schema + Zed。
- buzz 完全放弃 `session/load`（崩溃即 respawn + 上下文重注入）——我们已有 JSONL 权威 + resume 语义，buzz 模型仅作「resume 失败降级路径」参考。

## 6 本项目接入规划（提案，待确认）

### 6.1 现状与落点

现有三种 agent 接入形态：

| Provider | 形态 | 深度 |
|---|---|---|
| claude | 直拉 CLI + stream-json 全解析（`claude-runtime.ts`）+ relay 双缓冲 + native history | 最重 |
| codex | tmux passthrough（`capabilities.history: "unsupported"`） | 最轻 |
| pi | SDK 嵌入（`@earendil-works/pi-coding-agent`，独立 chat 体系，非 AgentSession） | 中 |

接入缝现成：`AgentProvider` union（shared `index.ts:323`）+ `AgentProviderProfile`（`agent-provider-profiles.ts`，含 `capabilities.history` 标记）+ 架构文档预留的 `ProviderAdapter` seam（未实现）。

**ACP 接入 = 第四种形态：协议级 adapter**（spawn ACP agent 子进程 + JSON-RPC 双向循环），复杂度接近 claude 管道（进程生命周期/流式帧/resume/权限四面）。

**关键架构优势**：ACP 的「client 管进程、agent 管持久化」与我们的 message-replay 设计同构；`session/load` 回放 ≈ relay history 段、`session/resume` ≈ 纯 live 重连。**ACP 帧在 runtime 层翻译成现有 `SessionStreamServerMessage` union 喂 relay → 前端渲染管线零改动复用**（聊天流/工具卡片/思考块全部现有 UI）。我们是服务器本地 spawn（stdio），remote transport 不 stable 的影响为零。

### 6.2 方案要点

1. **新增通用 `acp` provider**（不逐个加 gemini/copilot/… provider id）：`AgentProvider` 加 `"acp"` 一个成员；`AgentProviderProfile.profiles` 加 acp 条目（command 从 settings/预设读取，仿 claude presets 体系）；**预设目录**内置常见 ACP agent 的启动配置（gemini: `gemini --acp`、qwen: `qwen --acp`、copilot: `copilot --acp`、kimi: `kimi acp`、任意 command 自定义）。这与 Happy/Paseo 的 `extends:"acp"` 配置级模式同构，业界已验证。
2. **新建 `api/src/acp-runtime.ts`**（对应 claude-runtime 的位置）：Bun.spawn ACP agent 子进程（进程组 + killpg 清理）→ 官方 `@agentclientprotocol/sdk` v1 建连（NDJSON 流 + 行上限 + 写超时）→ initialize（pin v1，fs/terminal capability 不广告——我们有真实 Files/Terminal 面，agent 文件访问走它自己的工具）→ session/new(cwd=project path) → prompt/update 流翻译成现有帧 union 喂 relay。
   - **SDK vs 手写**：官方 TS SDK（schema + Zod 校验，起步快）为默认推荐；但注意 buzz 与 lobehub 两家都**手写** stdio JSON-RPC 不用官方 SDK——理由是强类型 schema 遇字段漂移要绕类型体操。若 Phase 1 实测 SDK 类型碍事，降级路径是「SDK 建连 + 动态值消费」（边界解析 zod passthrough），不必整体手写。
3. **帧翻译映射**（acp update → `SessionStreamServerMessage`）：`agent_message_chunk`→assistant 帧、`agent_thought_chunk`→thinking、`tool_call`/`tool_call_update`→tool 帧族、`plan`→task 帧、`usage_update`→token 用量、`user_message_chunk`→user echo。stopReason→result 帧。
4. **resume**：spawn 时若 metadata 有 `acpSessionId` → `session/load`（capabilities 探测：agent 广告 `loadSession` 才支持；回放流喂 relay historyLines，与 claude `--resume` 同构）。无 loadSession 的 agent 标注「不支持跨重启恢复」（profiles capabilities 已有此标记位）。
5. **权限**：`session/request_permission` → 现有 approvals UI 通路（claude control_request permission 同语义）；allow/reject × once/always 直接映射现有按钮语义。
6. **深控制**：模型/模式切换走 `session/set_config_option`（先对照 agent 广告的 modes/configOptions，goose 崩溃教训）；slash 命令经 `available_commands_update` + prompt 首 block 直通。
7. **Claude/Codex 不动**：现行走原生管道（业界 wrapper 主流同构、深度最好）。Codex 未来若重做，业界事实标准是 app-server JSON-RPC（另案，非 ACP adapter）。

### 6.3 分阶段步骤

| 阶段 | 内容 | 验收 |
|---|---|---|
| **Phase 1：协议 PoC** | `acp-runtime.ts` 骨架 + SDK 建连 + spawn Gemini CLI（原生参考实现质量最高）+ new/prompt/update/cancel 跑通 + 帧翻译最小集（消息/思考/工具）→ 喂 relay | 真机 Gemini 会话端到端聊天流可见、流式渲染、turn 结束 |
| **Phase 2：provider 化** | `AgentProvider`+"acp" + profile/预设（settings 配置面：预设列表 + 自定义 command）+ resume（session/load → historyLines）+ 前端 provider 选择 + 权限请求 → approvals UI | 创建/恢复 ACP 会话、权限弹窗可用、至少 3 个预设 agent 可用 |
| **Phase 3：深控制对齐** | 模型/模式切换（set_config_option）、usage_update、plan 帧、slash 命令、availableModels 探测、错误/超时/熔断（双超时模型）、v2 draft 跟踪 | 与 claude 会话的控制面对齐度；无人值守稳定性 |

### 6.4 风险与边界

- **adapter/agent 质量参差**（buzz 血泪清单全部适用）：字段漂移/错误码不可探测/cancel 不停——zod 边界容错 + 正向白名单 + drain 兜底。
- **各 agent resume 深度不一**：capabilities 探测 + UI 明示降级（无 loadSession = 刷新需重建）。
- **v2 在途**：pin v1；SDK dual-version 示例在，迁移成本可控。
- **session/list 与我们 AgentSession 模型的关系**：ACP session 由我们 metadata 持有（`acpSessionId`），不用 session/list 做发现（Phase 3 再评估）。
- 单 commit/阶段独立可回退；Phase 1 只加文件不触碰现有管道。

### 6.5 Phase 3 具体化：模型/配置透传与切换（2026-09-18 omp 第一手核实）

**omp 广告什么**（`~/repos/oh-my-pi/packages/coding-agent/src/modes/acp/acp-agent.ts` `#buildConfigOptions`，一手源码）：`session/new`、`session/load`、`session/set_config_option` 的响应及 `config_option_update` 通知均携带 `configOptions[]`，omp 广告三个 select 项：

- `Mode`（category=mode）：plan/edit 等模式，`options[{value, name, description}]`；
- `Model`（category=model）：`currentValue` + `options[{value=modelId, name, description="provider/id"}]`；**仅在 `models.length > 0` 时广告**——凭据不可用时连此项都没有（选择器为空即凭据问题信号，与 2026-09-17「删回退后 omp 模型列表为空」事件互证）；
- `Thinking`（category=thought_level）：off / auto / 可用级别。

**怎么切**：`session/set_config_option {sessionId, id, value}` → omp 端 `#setModelById` → `session.setModel(model)`（未知 modelId 报错）；变更经响应的 `configOptions` 回传 + `config_option_update` 通知广播。

**设计决策**：

1. **设置层不加模型字段**——模型是 agent 自身资产（默认模型归 agent 自身配置体系），配置面位置在会话 detail：透传 `configOptions` + 选择器（与 claude `switch_model` 同位）。
2. **一次性改动全 ACP 受益**——configOptions 捕获/透传/选择器做在通用 acp 管道，未来 gemini/kimi 等 profile 接入即自带模型/模式/thinking 切换，无 per-CLI 增量。
3. Phase 3 余项：usage_update、plan 帧、slash 命令、双超时熔断、v2 draft 跟踪。

**未来新 CLI 接入决策树**（配置视角完整路径，收口结论同步见 [provider-config-comparison.md](./provider-config-comparison.md) 收口节）：

| 形态 | 路径 | 边际成本 |
|---|---|---|
| 支持 ACP（未来大多数） | 注册表加 profile 声明（command / 凭据 env 名 / label），管道与凭据卡全复用 | 一条声明 + **一次真机验证**（buzz 血泪：验证不可省） |
| 有结构化协议无 ACP | 逐家写管道（codex app-server 先例，业界三家同选） | 数百行，仅对足够重要的 CLI |
| 仅终端形态 | tmux 降级（`capabilities.history: "unsupported"`） | 最小，体验降级 |
| 非 CLI、纯 chat/complete 端点 | chat 轨另立项（模型列表 AUTODETECT 配置面） | 新 transport，非新产品入口（LobeChat 实证：入口与界面统一，分叉在 transport 层） |

## 7 证据索引

- ACP 官网：agentclientprotocol.com（protocol v1/v2 各页、get-started/{agents,clients,registry}、announcements）；registry JSON：`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
- SDK：github.com/agentclientprotocol/typescript-sdk（npm `@agentclientprotocol/sdk`）；rust-sdk；python-sdk
- Claude adapter：github.com/agentclientprotocol/claude-agent-acp（v0.77.0）；Codex adapter：github.com/agentclientprotocol/codex-acp（v1.11.0）
- Gemini CLI：github.com/google-gemini/gemini-cli `packages/cli/src/acp/` + `docs/cli/acp-mode.md`
- 竞品：BloopAI/vibe-kanban（vibekanban.com/blog/shutdown）、slopus/happy、sst/opencode、charmbracelet/crush（issue #990）、omnara-ai/omnara、conductor.build/docs、block/goose、zed-industries/zed、getpaseo/paseo
- 本地源码：`~/repos/buzz` crates/buzz-acp（ACP 客户端第一手工程参考）
