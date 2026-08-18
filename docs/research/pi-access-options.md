# Pi 接入调研（pi-access-options）

本文件沉淀 2026-08-07 关于「接入 pi 作为第四个 agent runtime」的多轮调研，用于后续决策。本文是研究材料，不是最终架构决策；**接入决策尚未做出**，用户仍在评估。承接 [`agent-access-options.md`](./agent-access-options.md)（多 provider 接入路线的延续，pi 作为 claude / codex / claude 之外的新候选 provider）。

## 调研状态

- 调研时间：2026-08-07
- 触发：用户提议接入 pi（"类似于 claude 的 runtime"），并相继提出对 pi 生态、定制性、同类接入方式、国产案例（MonkeyCode）的疑虑。
- 结论等级：阶段性研究结论，决策未做。
- **补充（2026-08-18）**：chat 模式运行时调研——用户新场景（对话/Agent 双模式之对话侧，见 [`agent-vs-chat-modes.md`](./agent-vs-chat-modes.md)），运行时候选 pi vs DeepSeek Harness（dsh），**决策选 pi（库嵌入）、纯调研不做 PoC**；本次为一手源码核实（clone `~/repos/pi`，depth 1），见 §9。
- 证据分级（重要，落地前请按等级复核）：
  - **一手源码核实**（2026-08-18）：`earendil-works/pi` clone 到 `~/repos/pi` 直接读源码。SDK 工具裁剪、事件流、prompt 上行契约、Bun 兼容性、session JSONL 路径均已核实（§9）。
  - **一手硬证据**：GitHub API 实查 `chaitin/MonkeyCode` 的 `.gitmodules`；`pi.dev` / `omp.sh` 官方页。
  - **deepwiki 源码索引**：基于 deepwiki 对 pi / omp 仓库的 AI 概括，**非直接读源码**。协议字段、API 形状落地前需 clone 到 `~/repos` 实测。
  - **官方/半官方资料**：pi / omp 官方文档与 wiki、oma-home skills hub。
  - **社区弱信号**：知乎 / CSDN / cnblogs / runoob / pyshine / Reddit 文章（stars 数量、特性对比、架构解读）。只能作数量级与方向参考，不能单独定论。
  - **未核实**：OpenClaw 的 stars（社区传 361k）与"库嵌入 `pi-agent-core`"的对接细节，来自社区文章与疑似第三方文档（`docs.xiaolongxia.org/pi`），**未一手核实**。
  - **推断**：MonkeyCode 的服务端对接方式——`chaitin/OhMyAgent` 私有（404），源码不可见，下文对接方式是基于公开证据的**强推断**，非确认。

## 调研对象

### pi（earendil-works/pi）

- 仓库：`https://github.com/earendil-works/pi`，官网 `https://pi.dev/`，MIT。
- 作者：Mario Zechner（GitHub `mariozechner`，组织 scope `earendil-works`）。npm scope 经历 `@mariozechner/pi-*` → `@earendil-works/pi-*` 的迁移；omp fork 自这条线的 `pi-mono`。**同一条线，不是两个项目。**
- 证据类型：官方资料 + deepwiki + 社区弱信号。

### omp — Oh My Pi（can1357/oh-my-pi）

- 仓库：`https://github.com/can1357/oh-my-pi`，官网 `https://omp.sh/`。
- 定位：pi 的 fork，"batteries-included"。
- 证据类型：官方资料 + deepwiki + 社区弱信号。

### OhMyAgent（chaitin/OhMyAgent）

- 仓库：`git@github.com:chaitin/OhMyAgent.git`（MonkeyCode 的 agent submodule）——**私有，404**。
- 官方 skills hub：`oma-home/ohmyagent-skills-hub`（自称 "Pi-compatible"）。
- 证据类型：一手 gh（仅确认存在与 Pi-compatible 声明）+ 推断。

### 同类集成方

- `BlackBeltTechnology/pi-agent-dashboard`、TelePi、OpenClaw、`m0n0x41d/haft`。证据类型：deepwiki + 社区弱信号。

## 总体摘要（先给判断）

1. **pi 是什么**：开源 TypeScript agent harness（monorepo：`pi-agent-core` 内核 + `pi-ai` LLM 抽象 + `pi-tui` 终端 UI + `pi-coding-agent` CLI/SDK）。~84k stars（2026，社区数据，数量级参考），比 OpenCode（~160k）更早、governance 仍在演进。"pi" / "pi agent" / "pi-coding-agent" 三者一回事。
2. **接入面丰富**：四个 entry point——interactive TUI / one-shot print（`-p --mode json`）/ RPC（`--mode rpc` stdio JSON）/ **ACP**（Agent Client Protocol）——外加 Node SDK（`createAgentSession`/`AgentSession`/`SessionManager`）与 experimental `PiServer`/`PiClient`（多客户端 lease）。**ACP 是本轮才补全的第 4 面，前几轮漏列。**
3. **生态**：skills 用标准 `SKILL.md`，**跨 harness 互通**（可读 `~/.claude/skills`、`~/.codex/skills`、共享 `~/.agents/skills`）；extensions 是 TS 可编程模块；prompt templates / themes；`pi install` + `pi.dev/packages` gallery。**MCP 是 pi 的刻意缺位**——官方"No MCP"哲学，靠 extension 桥接。
4. **omp = pi 的协议兼容 fork**：保留 pi 全部集成面（rpc/sdk/extension/jsonl），分叉仅在 UI/命名/认证（`agent.db` vs `auth.json`）。**接入 omp ≈ 接入 pi（技术同构）**，但 omp 有"用 Claude Code OAuth 模拟指纹"的争议行为与 fork 维护成本。
5. **同类接入方式的因果**：spawn vs 库嵌入的分水岭**不是轻重，是「要不要终端形态」**。要 xterm/PTY → spawn（pi-agent-dashboard）；不要终端、把 agent 当后端 engine → 库嵌入（OpenClaw 嵌 `pi-agent-core`、TelePi 嵌 `pi-coding-agent`）。
6. **国产案例**：MonkeyCode（长亭科技云端编程平台）的 agent 内核是 OhMyAgent，OhMyAgent 官方自称 Pi-compatible——**国产大厂在用 pi 系做商业云端平台**。其服务端对接方式私有不可见。
7. **对本项目的初步倾向**：本项目是 terminal-first（Claude = spawn + tmux + xterm），按终端形态分水岭落在 spawn 一侧，与 pi-agent-dashboard 同构；**初步倾向路径 B（`pi --mode rpc` spawn）**。但这是倾向，非决策（见 §8）。

## 1. pi 是什么

- **定位**："minimal agent harness"，极简内核（read/write/edit/bash），其余靠 extensions/skills/prompt templates/themes 扩展。统一 LLM API（15+ provider）。
- **成熟度**（社区数据，数量级参考）：~84k stars、264 contributors；2026-05 迁到 Earendil Works 组织；safety mode / governance 仍在社区讨论，没有 OpenCode 那种 CVE 跟踪。**判断：健康、成长快，但成熟度早期，作为长期 provider 需对冲上游快速演进。**
- **monorepo 结构**（deepwiki）：
  - `pi-agent-core`：agent loop + AgentHarness（最底层内核，OpenClaw 嵌这层）
  - `pi-ai`：LLM provider 抽象（streaming / ModelRegistry / credentials / prompt caching / thinking / cross-provider handoff）
  - `pi-tui`：终端 UI（渲染 / 编辑器 / 键位 / 组件库）
  - `pi-coding-agent`：interactive CLI（settings/themes/slash/prompt templates）+ print/rpc/ACP mode + Node SDK + experimental session server/client

## 2. pi 的接入面（技术契约）

四个 entry point + SDK + experimental server（官方对"外部 UI / 远程控制"明确指向 rpc 与 SDK，server/client 为实验性未来方向）：

| 面 | 形态 | 适用 |
|---|---|---|
| interactive | TUI | 给人用；不适合控制面 |
| print（`-p --mode json`） | 单次，stdout 输出 `AgentSessionEvent` JSONL，stdin 接 prompt | 单次脚本 |
| **rpc（`--mode rpc`）** | 长连，stdin 发 JSON 命令（prompt/steer/follow_up），stdout 收 `AgentSessionEvent` JSONL 流；TS `RpcClient` + 官方 Python `omp-rpc`，含 v2 negotiation + 大 payload 分块 | **IDE 扩展 / web UI / 远程控制平面（官方推荐）** |
| **ACP** | Agent Client Protocol（面向编辑器/客户端的开放协议模式） | 编辑器集成 / 对外标准协议 |
| Node SDK | `createAgentSession` / `AgentSession` / `SessionManager` / `AgentSessionRuntime` / `ModelRuntime` / `DefaultResourceLoader`，进程内 `session.subscribe()` 收事件、`session.prompt()` 驱动 turn | Node/Bun 应用库嵌入 |
| experimental `PiServer`/`PiClient`/`pi-protocol` | CBOR over Unix socket，`PiClient` 是 `AgentSession` 的 drop-in 替换，支持 exclusive/shared lease + 事件订阅 | 多客户端远程（未来方向，**无成熟项目在用**） |

**session 持久化与 resume**（deepwiki，与 Claude Code JSONL 几乎同构）：
- JSONL 存 `~/.pi/agent/sessions/<encoded-cwd>/`，树状历史（`id`/`parentId`，支持 branching/fork）。
- 文件头 `type:"session"`（sessionId/version/timestamp/cwd）；条目含 `AgentMessage`（TextContent/ImageContent/ThinkingContent/ToolCall）、UserMessage/AssistantMessage、compaction/branch_summary/model_change/thinking_level_change。
- resume：`AgentSessionRuntime.switchSession(path)` / `fork(entryId)`；CLI `pi --session <path>` / `pi --fork <path>`。有 `sessionId` 字符串，可比 Claude Code sessionId。

## 3. pi 的扩展生态与定制性

**skills**：标准 `SKILL.md`（frontmatter name/description）；发现目录 `~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/`、`.agents/skills/`（递归）；`/skill:name` 调用。**跨 harness 互通**——可读 `~/.claude/skills/*/SKILL.md`、`~/.codex/skills/`，可在 settings 配置共享目录，**同一份 SKILL.md 跨 pi / Claude Code / Codex 复用**。

**extensions**：TS/JS 模块，导出 default factory 接收 `ExtensionAPI`，可注册 tools / commands / 快捷键 / event handler / UI 组件；`~/.pi/agent/extensions/`；`jiti` 运行时加载，`/reload` 热重载；`pi.registerTool()` 注册自定义工具。

**prompt templates**（Markdown，`{{focus}}` 占位，`/name` 展开）/ **themes**（JSON，TUI 外观）：`~/.pi/agent/{prompts,themes}`。

**pi packages**：`package.json` 的 `pi` key 声明资源，或约定目录自动发现；`pi install npm:... / git:... / local` 装到 `~/.pi/agent/{git,npm}`；官方 gallery `pi.dev/packages`。

**MCP（刻意缺位）**：pi 官方"No MCP"哲学，**原生不做 MCP client**；靠 extension 桥接（pi.dev/packages 有社区 MCP adapter，接 OpenAI/Brave 等）。**这是 pi 与 Claude Code / Codex 的本质差异，也是和本项目 `mcp-hub` 模型的张力点（见 §7、§8 L2）。**

**定制性（SDK 程序化可控，Claude Code 做不到）**：
- `DefaultResourceLoader`：`additional{Extension,Skill,PromptTemplate,Theme}Paths` / `{extensions,skills,prompts,themes}Override` / `no{Extensions,Skills,...}` / `systemPromptOverride`。
- discovery API：`getExtensions()` / `getSkills()` / `getPrompts()` / `getThemes()`（可枚举已装资源）。
- `ModelRuntime`：`setRuntimeApiKey(provider,key)` 运行时配 key 不落盘、`getAvailable()`、可注入 `InMemoryCredentialStore`。
- 边界：SDK **不直接暴露 install/enable/disable** runtime API——进程内控制靠 override，包安装走 `pi install` CLI。

## 4. omp = pi 的协议兼容 fork

- can1357/oh-my-pi，fork 自 pi（pi-mono），"batteries-included"：加 LSP / DAP / hash-anchored edits / subagents / plan mode / 40+ provider / 32 tools / hindsight memory。CLI `omp`，包名 `@oh-my-pi/pi-coding-agent`。
- **保留 pi 全部集成面**：`omp --mode rpc`、SDK（`createAgentSession`/`SessionManager`/`AgentSession`）、extension system（兼容 legacy `pkg.pi`）、JSONL session（`~/.omp/sessions/`）。
- **分叉点**（表层，非协议）：UI 架构、组件/API 命名、文件整合、测试框架、tool 架构、认证存储（omp `agent.db` Bun SQLite 多 credential round-robin vs pi `proper-lockfile`+`auth.json`）。
- **争议**：omp 用 Claude Code 的 OAuth 登录（模拟 Claude 请求指纹），合规/稳定性风险（社区讨论，未在 omp 源码一手确认）。
- **含义**：接入 omp 与接入 pi **技术近乎同构**，接入代码通用，换命令/包名/session 路径即可。"选 pi 还是 omp"是产品取舍，不是技术风险（见 §8）。

## 5. 同类项目接入方式与因果

| 项目 | 形态 | 接入方式 | 要终端？ |
|---|---|---|---|
| **pi-agent-dashboard** | 多 session web + terminal + diff | **spawn `pi --mode rpc`**（headless 默认 / tmux 可选）+ **Bridge Extension**（session 内事件钩子 + PromptBus 路由交互 UI）+ 直接 import `SessionManager` 读 JSONL 历史 | 是（xterm.js + node-pty） |
| **TelePi** | Telegram 1:1 远程 | **库嵌入 `pi-coding-agent` SDK**（进程内 `AgentSession`，不 spawn） | 否（输出进 Telegram 消息） |
| **OpenClaw** | messaging-gateway / web，头部集成方（stars 未核实） | **库嵌入 `pi-agent-core`**（in-process，不 spawn 不 rpc） | 否（agent 当后端 engine） |
| **haft** | 远程控制 claude/codex | spawn + MCP（claude/codex）；**pi 尚未接**（issue #82，卡在 pi 无 MCP） | — |
| 官方 PiServer/PiClient | 多客户端远程 | server/client（CBOR/Unix socket） | —（experimental，无成熟项目用） |

**核心因果（修正前几轮的"轻→库嵌入、重→spawn"简化）**：

> **spawn vs 库嵌入的分水岭不是轻重，是「要不要终端形态」。**
> - 要 xterm/PTY（让用户像操作终端）→ **spawn**。pi-agent-dashboard 要 xterm + node-pty，故 spawn；spawn 还带来进程隔离（崩溃/泄漏/版本不牵连宿主）。
> - 不要终端、把 agent 当后端 engine、输出走自己的 UI/消息流 → **库嵌入**。OpenClaw 把 pi 嵌进 messaging gateway；TelePi 把输出灌进 Telegram。两者都不要终端，故都库嵌入。
>
> 库嵌入还分两层：嵌最底层 `pi-agent-core`（只要 agent loop，自造上层，OpenClaw）；嵌 `pi-coding-agent`（拿现成 session/skills，TelePi）。

**Bridge Extension 模式（pi 相对 Claude Code 的独有增强）**：pi-agent-dashboard 不是裸 spawn + 读 stdout，而是 spawn rpc + 往每个 session 注入一个 extension，钩住事件并 patch `ctx.ui`（confirm/select/input/editor）把交互对话框路由到浏览器。Claude Code（闭源 CLI）做不到这种"进程内钩子"。第一轮可先纯 rpc spawn，Bridge Extension 作第二轮增强。

## 6. 国产案例：MonkeyCode → OhMyAgent

**证据链（一手）**：
- MonkeyCode（长亭科技，国产云端企业级编程平台，定位 Cursor 国产替代）的 `.gitmodules`：`[submodule "agent"] path = agent url = git@github.com:chaitin/OhMyAgent.git`。
- `chaitin/OhMyAgent` 仓库 **404（私有）**。
- `oma-home/ohmyagent-skills-hub` tagline：**"Official Pi-compatible skills hub for OhMyAgent"**；skills 用标准 `SKILL.md` + `metadata.ohmyagent` 字段；runtime tools `bash/edit/find/grep/ls/read/write/web_extract/web_search/subagent`（与 pi/omp tool 集同源）。

**结论**：MonkeyCode 的 agent 内核 OhMyAgent 是 **pi 系（Pi-compatible）**。国产大厂（安全领域头部）用 pi 系做商业云端编程平台。

**对接方式（私有边界 + 强推断）**：
- `chaitin/OhMyAgent` 私有，**服务端确切对接方式不可见**。
- MonkeyCode 是"每个 task 跑在真实 server-side environment"的云端平台（多用户、服务端常驻），**不可能用 interactive TUI**。
- OhMyAgent 是 pi 系 → 继承四 entry point + SDK。故对接**必然在 headless 面**（rpc / SDK 嵌入 / ACP）。
- 形态上 MonkeyCode ≈ OpenClaw（平台 + 嵌入 agent engine），**最可能服务端库嵌入 SDK 或 rpc spawn**，而非 CLI passthrough。**这是推断，非确认。**

**两个判断**：
1. pi 有国产商业产品背书（长亭），不是玩具。
2. 长亭走"**内核私有 + skills 生态公开（Pi-compatible）**"策略（私 submodule + 公开 oma-home skills hub），与 OpenClaw（公开用 pi-agent-core）是两种玩法。本项目若接 pi，是在"公开用 pi"侧，skills 市场天然与 pi/omp/OhMyAgent 共用（都 SKILL.md）。

## 7. 与本项目基线对照

**本项目已有 skills 市场**（`api/src/skill-market.ts`）：
- `SkillAgent = "claude-code" | "codex"`，各对应 `~/.claude/skills`、`~/.codex/skills`。
- 发现层：server 代理 skills.sh `/api/search`（避 CORS）；已装直扫全局 skills 目录读 `SKILL.md`；源（sources）存 settings；install/uninstall 后 server 遍历活跃 session 发 `/reload-skills` → CLI reload → broadcast `skill_catalog_changed`。
- **基于 SKILL.md 标准 + skills.sh 市场 + npx skills CLI**。

**本项目 MCP 注入**（`api/src/mcp-injector.ts` + `mcp-hub-server.ts`）：
- per-runtime 注入器 `McpInjector`，把 hub 连接信息翻译成 spawn argv。`ClaudeMcpInjector`：`--mcp-config` inline JSON（type:http，连 `http://127.0.0.1:{port}/mcp/{project}`）。注入器注册表 `injectors: Partial<Record<AgentProvider, McpInjector>>`，`buildMcpInjectorForProvider(profile)`——**接入 pi 时这里加 `PiMcpInjector`（若要 MCP）**。
- `mcp-hub-server`：loopback HTTP server，`/mcp/{project}`，wiki_* 工具 producer，只给本机 agent 连。

**接入点骨架**（基于 `agent-provider-profiles.ts` / `session-registry.ts` 现有抽象）：
1. shared（`packages/shared/src/index.ts`）：`AgentProvider` 加 `"pi"`；视情况补 pi 事件/thinking-level 映射类型。
2. provider profile（`agent-provider-profiles.ts`）：加 `pi` 条目，`capabilities.history` = `"native"`（rpc 路径）或 `"unsupported"`（tmux 路径）。
3. runtime adapter：写 `PiRuntime implements RuntimeResources`（exists/startAgent/stream/close/listAliveRuntimeKeys）——rpc 路径下 spawn `pi --mode rpc` + RPC 协议对接，与 `ClaudeRuntime` 同构。
4. stream controller：仿 `claude-stream.ts`（pi 事件 → broadcast + JSONL relay + `addSubscriber` 回放 + `createBatchEmitter`）。大头是 pi `AgentSessionEvent` → 项目 `ClaudeStreamServerMessage` 的 normalizer（pi 的 message_update/text_delta/ToolCall/compaction 映射；语义接近 Claude，可参考现有 JSONL 解析）。
5. `index.ts`：实例化 + 接 registry。
6. web：i18n key、`ShellIcon` 注册 pi logo（已有 Anthropic/OpenAI 厂商 logo 模式）、provider 选择 UI、pi adapter（事件语义接近 claude，可复用）。

## 8. 接入路径分析与初步倾向（决策未做）

**三条路径**：

| 路径 | 形态 | 体验上限 | 备注 |
|---|---|---|---|
| A. 库嵌入 SDK | `import` pi-coding-agent，进程内 `AgentSession` | 结构化、类型安全 | 牺牲进程隔离；与现有 skills 市场范式（扫目录）不一致 |
| **B. rpc spawn（初步倾向）** | spawn `pi --mode rpc`，stdio JSON | 结构化、进程隔离 | 与 `ClaudeRuntime` 同构，relay 复用；pi-agent-dashboard 同构先例 |
| C. tmux passthrough | `pi -p --mode json` 或 TUI + tmux | `history: unsupported` 降级 | pi 有 rpc，不必退回 tmux |

**初步倾向 B，理由（基于公开证据，非定论）**：
- 本项目 terminal-first（Claude = spawn + tmux + xterm），按"终端形态"分水岭天然在 spawn 一侧（§5 因果）。
- 与 `ClaudeRuntime` 范式同构，relay / 回放 / batch emitter 可复用，只需 pi-event normalizer。
- pi-agent-dashboard（唯一形态同构的先例）也是 spawn rpc，有成熟开源实现可逐条对照，降风险。
- 排除 A：库嵌入牺牲崩溃隔离（多 session 常驻服务器是硬约束），且与现有 skills 市场"扫目录管理"范式不一致；OpenClaw/TelePi 选库嵌入是因不要终端，与本项目不同构。
- 排除 C：pi 有 rpc，退回 tmux 是 claude/codex 早期无协议时的妥协，无必要。
- 官方 PiServer/PiClient 先观望（experimental + breaking changes，无成熟项目用）。

**真正的决策点（不是"选不选 spawn"）**：spawn 已被 terminal-first 约束定下；pi 相对 claude 唯一新增的决策是 **spawn 之上要不要加 pi extension 层（Bridge Extension 模式）**：
- 不加（纯 rpc spawn）：体验等价 claude，最小增量。
- 加（Bridge Extension）：额外拿到交互层控制权（confirm/select 路由到 web），比 claude 更强，但要维护 extension + WS 桥。
- 初步倾向：第一轮不加，先把第四个 provider 同构落地；extension 层作"pi 增强"单独立项。

**"纳入"扩展生态的分层（决策辅助）**：
- **L1 skills**：加 `SkillAgent = "pi"`（指 `~/.pi/agent/skills`，或配 pi 读共享 `~/.agents/skills` 让一份 SKILL.md 三 provider 共用）。近乎零成本，复用 skills.sh 市场 + reload 广播。**第一轮就做。**
- **L2 MCP**：pi "No MCP" → `mcp-hub` + `--mcp-config` 注入对 pi **不生效**。两路：① 给 pi 装社区 MCP adapter extension 连 hub（`PiMcpInjector` 改为"确保 extension 在 + 配 URL"）；② `canInject=false` 降级（pi 不连 hub，不阻塞，= Codex 现状）。**初步倾向先 ② 降级。**
- **L3 extensions/prompts/themes**：先 passthrough（`pi install` 用户自理），不纳入 UI；未来按需用 `ResourceLoader` discovery API 做只读展示。

**pi vs omp（目标选择，决策辅助）**：因 omp 协议兼容 pi（§4），接入代码通用，故这是产品取舍非技术风险：
- 上游 pi：极简，subagent/plan/LSP 自装 extension；跟上游，无 fork 分叉。**初步倾向**（与本项目"统一控制面、自管 provider/skills"理念一致，避开 fork 风险与 omp OAuth hack）。
- omp fork：subagent/plan/LSP/40 provider 开箱即用；但吃 fork 分叉（认证 `agent.db`）+ OAuth 争议行为 + 需盯 omp 与上游同步。

## 9. 待 PoC 的关键点（落地前必做）

1. **rpc 协议契约**：命令/事件的精确 JSON schema、resume 命令、steer/interrupt 边界（读 `packages/coding-agent/docs/json.md` + `modes/rpc/rpc-mode.ts` 源码实测）。
2. **ModelRuntime 配置**：pi 统一 LLM API 怎么配 provider/key，能否映射本项目 model tier / 运行时 `switch_model`。
3. **tool / permission 事件**：`ToolCall` 之外有无 approval/permission 事件，决定能否做 Claude 那样的权限 UI。
4. **跨 harness skills 目录发现**：一份 SKILL.md 三 provider 共用是否成立（pi 跨目录发现的真实行为）。
5. **pi MCP adapter extension 成熟度**（若 L2 要 MCP）。
6. **Bun 兼容性**（若考虑 A 路径备选）：pi 是否依赖 Node 特有 API。
7. **omp 与上游同步节奏**（若选 omp）。
8. **OpenClaw 库嵌入细节一手核实**（`docs.openclaw.ai`），它是修正 §5 因果的关键反例。

## 9.1 chat 模式运行时：库嵌入路径一手核实（2026-08-18）

**场景**：用户实现「对话（Chat）模式」时选择 pi 作运行时（排除 DeepSeek Harness，因其 TS SDK 仅 subprocess 形态，不满足"无进程代价"约束）。**决策：选 pi、库嵌入、纯调研不做 PoC**。本节约谈 §8 排除 A 路径（库嵌入）的前提——那是对 **agent 会话**场景（多 session 常驻、崩溃隔离硬约束）；chat 模式上下文不同（单个进程内、只读工具、无复杂编排），需重新核实。

**一手核实（clone `~/repos/pi` depth 1，读 `packages/coding-agent/src/core/`）**：

### 三个硬前提

| 前提 | 一手证据 | 结论 |
|---|---|---|
| 进程内、无子进程 | `createAgentSession()` 直接 new Agent + AgentSession，in-process（`core/sdk.ts:171`）；核心只 import `node:*` 内置模块（Bun 原生兼容）+ `src/bun/` 目录 | ✅ |
| 简洁可定制（工具裁剪） | `CreateAgentSessionOptions`：`noTools: "all"\|"builtin"`、`tools` allowlist、`excludeTools` denylist、`customTools`（`core/sdk.ts:61-75`） | ✅ |
| 崩溃隔离 | 库嵌入共享崩溃空间 | ⚠️ 部分满足（见下） |

### 工具裁剪链路（chat 只读形态 = 「不注册写工具」）

内置工具全集仅 7 个：`ToolName = "read"\|"bash"\|"edit"\|"write"\|"grep"\|"find"\|"ls"`（`core/tools/index.ts:83`）。装配逻辑（`agent-session.ts` `_refreshToolRegistry` L2531-2640）：

```
tools: ["read","grep","find","ls"]  → allowedToolNames 白名单（isAllowedTool 过滤 registry，含 custom/extensions）
noTools: "all"                      → 空白名单 → registry 全空（真·零工具）
excludeTools: ["bash"]              → denylist 后过滤
```

**chat 只读形态 = `tools: ["read","grep","find","ls"]`**，禁掉 bash/edit/write 三个写工具。这是最硬的权限边界（同 Proma Chat「只给几个函数」策略，见 [`agent-vs-chat-modes.md`](./agent-vs-chat-modes.md)），无需 canUseTool 拦截层。**但白名单在 `createAgentSession` 时固定，不能运行时切换**——chat 固定只读工具集，此限制不构成问题。

### 事件流（`AgentSession.subscribe(listener)` 收 `AgentSessionEvent`）

基底 `AgentEvent`（`packages/agent/src/types.ts:428`）：

- **message 生命周期**：`message_start`（user/assistant/toolResult）→ `message_update`（仅 assistant 流式增量）→ `message_end`
- **turn 边界**：`turn_start` / `turn_end`
- **tool 执行**：`tool_execution_start/update/end`
- **agent 生命周期**：`agent_start` / `agent_end`（携带全量 `messages`）

增量结构 `AssistantMessageEvent`（`packages/ai/src/types.ts:527`）：`text_delta`/`thinking_delta`/`toolcall_delta`（各带 `contentIndex` + 全量 `partial`）。

SDK 层叠加（`AgentSessionEvent` union，`agent-session.ts:142-184`）：`bash_execution_update`（bash 实时增量）、`queue_update`（steer/followUp 队列）、`compaction_start/end`、`agent_settled`、`entry_appended`、`session_info_changed` 等。

**对接本项目**：`subscribe` 是唯一上行入口，把 `AgentSessionEvent` 翻译成现有 `SessionStreamServerMessage` 协议即可——不破坏 `UI = f(state)` 单管道原则。

### prompt 上行契约（流式约束，现成 guard）

`prompt(text, options?)`（`agent-session.ts:1123`）：idle 时直接调用；**streaming 中必须传 `streamingBehavior: "steer" \| "followUp"`，否则 throw**（L1174-1179）。`steer(text)`（L1350）是流式中途引导。这正好约束「运行中发送」的上行语义。

### session 持久化

`SessionManager`（append-only JSONL 树，`session-manager.ts:855`）：`<agentDir>/sessions/--<编码 cwd>--/<ts>_<id>.jsonl`（L953、L476-486）。是 pi 自有 JSONL 格式，**不是 Claude session 格式**——chat 历史若要跨实现复用需写转换层。`buildSessionContext()` 从 JSONL 派生 LLM context。

### 与 dsh（DeepSeek Harness）对比（选型依据）

| | pi | dsh |
|---|---|---|
| 形态 | in-process SDK | TS SDK 仅 subprocess（stdio JSON-RPC） |
| 进程代价 | 无 | 每会话一个子进程 |
| 工具裁剪 | noTools/tools/excludeTools 一等公民 | 插件机制（"Everything is a Plugin"，Cordis），需自裁 |
| 权限审批 | — | 未实现（transport 预留） |
| mid-turn cancel | — | 无 |
| 成熟度 | 开源成长中（§1） | Developer preview，破坏性变更 |

dsh SDK 仅 subprocess 形态，**不满足「无进程代价」**——这正是用户排除它的原因，调研确认。

### 结论与代价

**pi 库嵌入做 chat 运行时可行**，与 Proma Chat/Agent 双模式同构（Chat = 简化引擎，Agent = 完整 harness）。三个要正视的代价：

1. **崩溃隔离**：进程内共享崩溃空间。对策：把 `createAgentSession` 隔离进独立 module/worker，或接受「pi 会话崩溃 = API 进程崩」。这是库嵌入 vs rpc spawn 的根本权衡。
2. **工具集固定**：白名单在创建时定死，chat 固定只读工具集不构成问题。
3. **session 格式是 pi 的 JSONL**：非 Claude 格式，历史复用需转换层。

**建议落地分步（可单独验收）**：P1 `createAgentSession({ tools: ["read","grep","find","ls"] })` + `SessionManager` 跑通最小闭环；P2 `subscribe` 事件 → 项目消息协议翻译层；P3 接入 UI（chat 入口 + 只读消息渲染）。

## 10. 开放问题

- pi 成熟度早期 + governance 未定，是否值得作为长期 provider（对冲策略）。
- pi "No MCP" 与本项目 `mcp-hub` 模型的长期取舍（降级 vs extension 桥接）。
- ACP mode 是否值得作为本项目对外暴露的标准 agent 控制协议（而非仅内部 spawn）。
- 多客户端并发 attach 同一 pi session 的 lease 语义（官方 PiServer 方向 vs 自建）。
- pi / omp 上游快速演进，capability negotiation 与版本 pin 策略。

## 11. 后续沉淀候选

verify / 决策后由 `distill-change` 提炼到：
- `docs/architecture/`：pi provider adapter / PiRuntime 与 ClaudeRuntime 的对照边界。
- `docs/design/`：pi `AgentSessionEvent` → 项目消息协议的映射设计。
- `docs/specs/`：pi provider 行为契约（接入后）。

## 参考来源

- pi：`https://github.com/earendil-works/pi` · `https://pi.dev/` · deepwiki（pi wiki）
- omp：`https://github.com/can1357/oh-my-pi` · `https://omp.sh/` · [Reddit Pi vs OMP](https://www.reddit.com/r/PiCodingAgent/comments/1ugjf8o/pi_vs_omp_architecture/)
- MonkeyCode / OhMyAgent：`chaitin/MonkeyCode` `.gitmodules`（gh 一手）· [oma-home/ohmyagent-skills-hub](https://github.com/oma-home/ohmyagent-skills-hub)
- 同类集成方：[pi-agent-dashboard](https://github.com/BlackBeltTechnology/pi-agent-dashboard) · [TelePi](https://futurelab.studio/blog/telepi-telegram-remote-control-for-pi/) · [haft issue #82](https://github.com/m0n0x41d/haft/issues/82) · [Armin Ronacher: Pi powering OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/)
- 社区（弱信号）：cnblogs（SDK 嵌入与 RPC 模式）· pyshine（omp 架构）· runoob（omp 教程）· gitcode/csdn（omp 深度解析）· 知乎（omp 评测）
