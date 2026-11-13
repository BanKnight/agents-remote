# T3 Code 调研与对比学习报告

> 调研时间：2026-11-13
> 来源仓库：~/repos/t3code（pingdotgg/t3code，浅克隆 + blob 限流，源码部分目录已 checkout）
> 分析范围：README/AGENTS.md/docs(internals+user)/源码（ClaudeAdapterV2、CodexAdapterV2、effect-codex-app-server、CheckpointStore、GitVcsDriver、AgentAwarenessRelay、mobile agent-awareness、orchestration-v2 等）+ 社区反馈（HN/Reddit/App Store/评测文）
> 证据分级：【源码】= 本地/远端源码一手实证；【文档】= 仓库官方文档；【社区】= 第三方转述（弱证据）

---

## 1. 产品画像

| 维度 | 事实 |
| --- | --- |
| 定位 | 开源「agent harness 控制面」：Node WebSocket server 包装本机 provider CLI，统一 web/desktop/mobile 三端。【文档】自述 "open source 'bring-your-own-subscription' alternative to Claude Desktop, Codex App, Cursor Glass, Conductor" |
| 作者 | Theo (t3dotgg) + Julius (jullerino)，Ping.gg / T3 Tools |
| License | MIT；创建 2026-02-08，迭代极快（截稿 58.6k stars，0.1.7 发布于 2026-11-04）【GitHub API】 |
| 用户规模 | README 自称 500k+ users、114+ contributors（0.0.34 时点）；2026-08-27 过 20k stars【文档/社区】 |
| 形态 | 单 server 多客户端：`apps/server`（Node + Effect，WS `/ws` 单连接 typed RPC）、`apps/web`（React + Vite，可本地托管也可用官方 hosted `app.t3.codes`——hosted 仅是客户端，不代理流量）、`apps/desktop`（Electron 包 web + 托管 server）、`apps/mobile`（React Native + Expo，iOS/Android 双商店，App 名 "T3 Code - Remote Claude & more"） |
| Provider 面 | Claude Code、Codex、Cursor、Grok、OpenCode 1.x/2.x、Pi、Antigravity、Kiro、Muse Code、fx + 任意 ACP agent。Codex 与 Claude 默认启用，其余手动开 |
| 成熟度 | Alpha→0.1.x，自我定位 "moving quickly, expect bugs"；protocol V2（V1 DB 单向迁移，V2 server 与 V1 app 互拒） |

**与我们同构点**：同样是「本机控制面 + 多客户端视图」——T3 的 environment/server 概念几乎就是我们的 api 进程；"The client shows the work. The environment performs the work." 的边界宣言与我们「网页控制平面」定位完全同源。**核心差异**：他们走原生移动 app（RN/Expo）+ 自有事件溯源 DB 权威；我们走 PWA + JSONL 权威。

## 2. 架构与集成方式

### 2.1 总体架构【源码】

```
clients (web/Electron/RN)
   │  一条认证 WebSocket (/ws)，Effect RPC typed 请求/响应/流
   ▼
apps/server（Effect 全栈，node:sqlite）
   ├─ ws.ts：订阅按线程/shell 分片（"订阅只送该客户端需要的状态，看一个线程不付全部线程的历史"）
   ├─ orchestration-v2/Orchestrator.ts：单 worker 串行化 command，纯决策不碰 I/O
   ├─ EventSink：events + projections + command receipt + outbox effects 同一 SQLite 事务提交
   ├─ EffectWorker：事务后跑副作用（起 provider turn / checkpoint / git），结果以新 command 回流
   ├─ EventStore 只留 ~1 天历史（重连 replay + command-id 重试去重）；projections 是当前态权威，
   │  老事件被 ProjectionMaintenance 修剪（游标落后则从快照恢复）
   ├─ provider adapters（Adapters/*.ts）+ provider-core 的能力声明
   └─ checkpointing/ → vcs/GitVcsDriver（隐藏 git refs）
```

要点：
- **事件溯源 + outbox**：command 决策纯函数化，副作用走队列 reactor。文档明言这是「多客户端同步 + 长任务恢复 + 可审计时间线」付出的机器成本（docs/internals/overview.md）。
- **权限模型**：session scope 在每个 RPC method 上强制（RpcScopeAuthorization）；WS ticket ~5min、bearer 30 天、relay DPoP ~1h（DPoP 把 token 绑到客户端 proof key）。配对（pairing）一次性 token 走 URL hash、用后即焚。
- **远程路由**：direct LAN / Tailscale / SSH 隧道 / T3 Connect（Cloudflare tunnel 托管中继）四条路，客户端保存有序 route 列表逐个试，连接中还会 preflight 更优路由自动切换；learned route 复用原 route 的凭据。headless `t3 serve` + systemd user service（lingering）+ 更新时 SQLite 快照 + 健康检查失败回滚。
- **终端**：server 持有 node-pty，增量 chunk 事件（非全量快照），server 侧 5000 行/8MiB 保留上限；渲染器 web/Android 用 **libghostty-vt**（ghostty 的 VT 解析器编成 C ABI/WASM），不回放历史 device query（防 junk 响应回 shell）。【源码 terminal/Manager.ts、docs/internals/terminal-runtime.md】

### 2.2 Provider 集成方式（与我们 Bun.spawn + stream-json/JSONL 对比）【源码】

| Provider | T3 Code 的接入 | 我们现状 |
| --- | --- | --- |
| Claude Code | **官方 `@anthropic-ai/claude-agent-sdk`**：`query()` + `resume`/`resumeSessionAt` + `forkSession`/`getSessionMessages`/`getSubagentMessages`（SDK 读 provider 原生会话），`canUseTool` 回调做审批，`PermissionUpdate` 映射权限模式。替换 SDK 默认 spawn 为自定义进程组 spawn（`/bin/sh -c` 包 watcher 脚本，detached 进程组，EOF 后 watcher SIGKILL 整组含 MCP 孙进程）——ClaudeAdapterV2.ts 13.7k 行 | Bun.spawn 直拉 CLI + stdin 写 + stdout stream-json relay；JSONL 为唯一权威。**同源异构**：SDK 底层就是 spawn CLI + stream-json，T3 选 SDK 换来 typed 消息/审批回调/fork API，代价是绑 SDK 版本与抽象泄漏处理（adapter 里大量 SDK quirk 补丁） |
| Codex | `codex app-server` 子进程 + JSON-RPC（自封装包 `packages/effect-codex-app-server`，schema 化协议、128MB 入站行上限、异步问题作为 notification 持久化） | 我们按 Codex CLI 接入（见 agent-access-options.md） |
| Cursor | 官方 Cursor SDK（浏览器登录） | 无 |
| Grok | ACP（Agent Client Protocol） | 无（ACP 接入调研已有，Phase 1 已落地 omp） |
| OpenCode | OpenCode SDK（1.x per-thread chat server / 2.x per-instance server + per-thread MCP entry + 权限规则互斥） | 无 |
| Pi | 用户自己的 `pi` RPC 模式 + 只注入命名空间 MCP bridge | 已接入（rpc spawn，路径同源） |

**适配器边界的关键设计**【源码 provider-core】：每个 driver 声明一份 `OrchestrationV2ProviderCapabilities`（sessions/threads/turns/streaming/tools/approvals/planning/subagents/context/checkpointing/identity/runtimePolicy 十余组布尔/枚举），例如 Claude：`canRollbackThread: true`、`supportsActiveSteering: true`、`approvalsHaveNativeRequestIds: true`、`providerCanRollbackConversation: true`；OpenCode/Antigravity 不支持的如实降级（"provider without a matching capability falls back to asking instead of pretending"）。客户端按 advertised capabilities 显隐功能，不假设自己版本描述 server。**这是他们多 provider 并存不烂掉的核心机制**——"Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb."（AGENTS.md Taste 节）。

**会话历史模型（与我们最大的分歧）**【源码】：T3 的权威 = 自己的 SQLite 事件溯源投影；provider 原生会话仅用于 resume（SDK `resume`）与 Codex usage 读取。外部 CLI 开的会话通过 `AgentSessionScanner/AgentSessionImporter`（扫 `~/.claude`、codex rollout、pi sessions 目录）**一次性导入**为自己的 thread，而非持续读 JSONL。跨 provider 继续 = "portable handoff"：预算化选择历史消息（默认 16k token 上限、保全文非摘要、带省略引用，agent 可用 thread-reading tool 取回），**不搬 reasoning/tool state**。对比我们「JSONL 是唯一权威、UI 缺失是渲染层过滤问题」：他们换来的是跨 provider 统一时间线 + 全文检索 + 与 provider 会话态解耦的 settle/queue；代价是导入/迁移/回放兼容性机器（migration 文档里大量「不重建 live session」「大历史分阶段导入」的 caveat）。**不建议跟进**（见 §5）。

### 2.3 会话管理模型【文档+源码】

- **生命周期**：environment > project > workspace（current checkout 或 git worktree）> thread（持久会话，含 provider/model/权限/分支/工作区记录）> turn（一次用户-agent 循环，围绕 turn 打 checkpoint）。
- **worktree 并行**：每 thread 可开独立 managed worktree（统一目录管理、路径信任校验）；`t3.json` 里 `runOnWorktreeCreate` 脚本自动装依赖/配端口；明确警示 worktree 只隔离文件不隔离端口/DB/容器等外部资源。
- **注意力生命周期**：thread 有 **settle/snooze/pin** 三态扩展——"Settling removes a task from my attention without deleting it"（完成 ≠ 收工，PR merged 才 settle）；server 侧 ThreadSettlementService 评估 PR merge + inactivity 规则自动 settle，merge 通知失效 PR 缓存再核验；agent 自己 `gh pr merge` 无人通知的场景由 PR sync reactor 在 run 结束后重读链接兜底。
- **队列**：消息队列在 server，重启存活，可编辑/重排/steer（Claude 支持 active steering 中断工具）。
- **计划任务**：recurring + 一次性（0.1.7）定时任务，走与 RPC 同一条 service 路径；usage limit 重置后 auto-resume。
- **多 agent**：`delegate_task` 让任意 provider 的 agent 起子任务（跨 harness：Claude 规划 + Codex 实现），父线程等待结果；native subagent 面板显示 provider 原生子代理的状态/model/tokens/工具；0.1.7 起子代理审批可在父会话内回答。
- **审批/通知**：审批 = 会话内 inline 卡片，任意客户端可答；**push 通知链**【源码 relay/AgentAwarenessRelay.ts + mobile features/agent-awareness】：server 监听 orchestration 事件 → 把「线程感知状态」（finished/failed/needs approval/needs input）发布到 T3 Connect relay（签名 HTTP API）→ relay 推 APNs/FCM + **iOS Live Activity push token**（锁屏实时卡片，无需 app 保活）+ Android ongoing notification/Live Update + 主屏 widget。手机不与环境保持连接。**push 必须走 T3 Connect，direct/Tailscale 不触发**（文档明示）。

## 3. 功能对照表

标注：✅ 有 · ⚠️ 部分/不同形态 · ❌ 无。我方现状按仓库规则文档与 routes/组件推断（如与实际有出入以实现为准）。

| 域 | 能力 | T3 Code | agents-remote |
| --- | --- | --- | --- |
| 会话管理 | 多 provider 会话并行（Codex/Claude/…） | ✅ 10+ provider | ✅ Claude/Codex/pi（+ACP） |
| | 会话历史权威 | ⚠️ 自有 SQLite 事件溯源（一次性导入外部会话） | ✅ JSONL 权威 + relay/live 双缓冲 |
| | 会话 fork / mid-thread 换 provider | ✅ fork + 有损 handoff | ❌ |
| | 消息队列（重启存活/可编辑/steering） | ✅ | ⚠️ 仅 Claude steering（stdin 直写），无持久队列 |
| | 注意力生命周期（settle/snooze/pin/auto-settle） | ✅ | ⚠️ running/等待态聚合，无 settle 语义 |
| | worktree 隔离线程 | ✅ 每线程 worktree + 建树脚本 | ⚠️ git 工作区面板有，线程级 worktree 编排无 |
| | turn 级 checkpoint + 消息级 revert（文件+会话态协同回滚） | ✅ refs/t3/checkpoints | ❌ |
| | 跨环境全文检索（消息内容级） | ✅ | ❌ |
| 移动端 | 手机控制 agent | ✅ RN/Expo 原生 app（iOS/Android 商店） | ⚠️ PWA（无商店分发，无 APNs 保底通道） |
| | 远程访问 | ✅ LAN/Tailscale/SSH/T3 Connect 隧道 + 配对码 | ✅ cloudflared tunnel（http2 修正） |
| | 推送通知（完成/失败/待审批/待输入） | ✅ relay→APNs/FCM + Live Activities + widget | ❌（PWA Web Push 未做） |
| | 移动端 diff/terminal/文件/审批 | ✅ 全量（PR code tab 仅桌面） | ✅（terminal 触摸滚动走 tmux copy-mode） |
| 工作流 | t3.json 项目配置（scripts/preview/worktree 策略，可入库） | ✅ | ⚠️ 项目配置有，无入库 schema 化 scripts+preview |
| | dev server preview 面板（脚本声明 previewUrl 自动打开） | ✅ | ❌ |
| | PR 工作流（4 forge、生成标题/描述、阻止直推默认分支） | ✅ | ⚠️ git 工作区/推送有，PR 编排无 |
| | thread↔PR 链接 + merge 自动 settle + PR watch 唤醒 agent | ✅ | ❌ |
| | 语音输入（iOS 26 端上 Apple 语音） | ✅ | ❌ |
| 通知 | turn 完成/需要输入提醒 | ✅ 系统级推送 | ⚠️ 仅 in-app 状态 |
| review | 三档 diff（per-turn / branch / unstaged） | ✅ | ⚠️ git diff 有，per-turn 无 |
| | diff 行选注释回填 composer | ✅ | ❌ |
| | checkpoints diff/revert UI | ✅ | ❌ |
| 多 agent | delegate_task 跨 harness 子任务 + 等待/收回流 | ✅ | ❌（OPC 方向在调研） |
| | native subagent 面板（状态/model/tokens/工具） | ✅ | ⚠️ 子 agent body 已有渲染 |
| 终端 | PTY 终端 | ✅ node-pty + ghostty-vt 渲染，server 保留 5k 行 | ✅ tmux attach（scrollback 服务端权威，比他们强） |
| 技能/插件 | composer `$` 技能选择 + 来源徽章（System/Personal/Project/App） | ✅ 读 provider 生态自有技能 | ✅ 技能/插件管理页（检测/更新管线更重） |
| usage | 用量页（token/模型/provider/API 等效成本/5h+周窗口） | ✅ | ⚠️ 部分 |
| 安全 | 密钥 server 存储不回传客户端、guest 只读链接（HMAC）、MCP OAuth+PKCE、scope 化 session | ✅ | ⚠️ PROJECTS_ROOT resolver、密钥不入库；无 guest 链接/多客户端 scope 模型 |

## 4. 学习点清单（按价值排序）

### A. 可直接借鉴（低-中成本，价值高）

1. **Provider 能力声明表（capability manifest）**【源码 provider-core/src/server/ProviderAdapter.ts + ClaudeAdapterV2.ts 顶部】
   - 是什么：每个 adapter 输出一组结构化能力（能否 rollback、能否 steering、审批是否有原生 id、checkpoint 谁负责……），orchestration 与 UI 只看能力不看 provider 名。
   - 为什么值得学：我们正在扩 provider（claude/codex/pi/ACP），目前差异散在调用点；一份能力表能让「这个 provider 没有 X 就隐藏/降级」从 if-else 变数据驱动，避免「假装所有 provider 一样」的烂抽象。T3 连「Auto-accept edits 在 Grok 不存在→静默回退 Supervised」这类边角都用它收口（providers.md）。
   - 成本：低。types + 各 provider 填表 + UI 消费点改造；无新依赖。
   - **本仓落地（2026-11-13）**：未照搬 T3 的 60 字段大表（那是 10+ provider 收敛后的形态），按「每字段至少两个 provider 取值不同 + 至少一个消费点」裁到 4 组有消费 + 1 组前向声明：
     - 类型单源 `packages/shared` `AgentProviderCapabilities`（history / mcpInject / modes{dualMode,terminalResumeId} / approvals{center,oneClick} / autoRetry / configSwitch）+ `WEAKEST_AGENT_CAPABILITIES` 最弱基线（新 provider spread 派生）；api `AgentProviderProfile.capabilities` 与投影 `AgentProviderInfo.capabilities` 引用同一类型（杜绝声明/投影二次漂移）。
     - 判定纯函数放 shared、前后端共用：`resolveModeSwitch(caps, session)`（能力 → unsupported；会话缺 `terminalResumeId` → missingResumeId；working/blocked → busy）与 `resolveAutoRetryCapability(caps, session)`（能力 && mode≠terminal）——**provider 能力 vs 会话级前置条件分离**（缺 resume id ≠ 无能力）。取代改前 5 处手写 if-else。
     - 通道选「全局一次拉取」`useAgentProviderInfos()`（`["agent-providers"]`，staleTime Infinity）而非塞进会话载荷：能力是 provider 静态属性，对所有同 provider 会话相同。
     - 接管热点：MCP 注入双轨收口（删 `McpInjector.canInject`，`buildMcpInjectorForProvider` 首行查 `capabilities.mcpInject`——能力声明成门禁单源）/ auto-retry 可用面（api `getAutoRetryTarget` + web 头部按钮/⋯ 菜单/ℹ 信息面/移动 ⋯）/ 双模式门禁（api `/mode` 路由按 verdict 映射 404/400/409；桌面 `SessionTabStripActions` + 移动 ⋯ 菜单）/ 显示名 + 创建菜单注册表驱动（`CREATE_PROVIDER_COPY` i18n 覆盖表 + `createProviderEntries` 单源，桌面 dropdown 与移动 sheet 同数据源，注册表顺序即菜单序 claude→omp→codex）。
     - 明确不做（挂后续批）：面板路由 `AgentPanelRouterInner`（按 provider 名分派三面板）、runtime 生命周期分发、配置切换 UI 消费（configSwitch 仅声明）、审批中心派发（approvals 仅声明）。
     - 行为变更三点：存量 tmux codex 双模式项「隐藏 → 显示禁用 + legacy 原因」；claude terminal 形态的 auto-retry 控制端点 404（web 有 gate 无感）；`/api/agent-providers` 响应顺序 claude/omp/codex（唯一消费方 settings 无可见影响）。

2. **Turn 级 checkpoint（隐藏 git refs）+ 协同 revert**【源码 vcs/GitVcsDriver.ts L1280-1370、checkpointing/CheckpointStore.ts】
   - 是什么：每 turn 用临时 index `write-tree` → `commit-tree`（parent=HEAD，使 HEAD 移动可追溯）→ `update-ref refs/t3/checkpoints/<...>`；不动用户分支与 index。回滚 = 恢复 checkpoint + 同步回滚 provider 会话态（provider 不能回会话的，如 Antigravity，直接拒绝回滚——能力表声明），且 turn 运行中禁止 revert。
   - 为什么值得学：这是「agent 工作可审、可退」的根基功能：per-turn diff 与「revert to this message」都靠它。我们已有 git 工作区面板，加这条是纯 git plumbing + 一个 diff 视图，与我们 JSONL 权威不冲突（checkpoint 是文件态，会话态我们天然有）。
   - 成本：低-中。api 侧 git plumbing ~百行级 + turn 边界挂钩 + diff/revert UI；Claude 会话态回滚可走 `--resume` 截断语义（需验证）。

3. **注意力生命周期：settle/snooze + PR-merge 自动 settle**【源码 orchestration-v2/ThreadSettlementService.ts、PullRequestSyncReactor.ts；docs/internals/overview.md】
   - 是什么：「agent 说完 ≠ 事办完」。settle 把已了结的 thread 移出活跃队列但不删除，可 unsettled；规则（PR merged / N 天不活跃）在 server 侧评估，不依赖客户端时钟。
   - 为什么值得学：我们的会话列表同样面临「完成的会话堆积」问题；settle 是比 archive 更贴合 agent 工作节奏的语义（Flavio 深评专门给了一节）。实现只是一个持久状态字段 + 少量规则 + 列表过滤。
   - 成本：低。

4. **Agent 感知推送（awareness 状态投影 → 推送通道）**【源码 relay/AgentAwarenessRelay.ts + apps/mobile/src/features/agent-awareness/】
   - 是什么：推送内容不是消息全文，而是**线程感知状态**（finished/failed/needs_approval/needs_input）的小投影，点开才拉线程；iOS 用 Live Activity push token 实现锁屏实时卡片，Android 用 ongoing notification。push 走托管 relay，P2P 数据不走云。
   - 为什么值得学：这恰好补我们 PWA 最大短板——离开页面后对 agent 状态失明。Web Push（VAPID，PWA 可用）+ 同款「感知状态投影」就能覆盖完成/待审批提醒；Live Activity 我们做不了，但锁屏通知+点击深链可达 80% 价值。T3 把「push 需要 relay」的取舍也讲清楚了（direct 连接不推送）——我们的 tunnel 天然充当这条腿。
   - 成本：中。Web Push 订阅/发送管线 + 事件侧挂钩（turn 结束/审批 pending）；无需 relay 改造（tunnel 已有）。

5. **消息队列重启存活 + 定时任务 + usage-limit 自动续跑**【docs/internals + user】
   - 是什么：发给 agent 的消息先入 server 队列（可编辑/重排/steer），重启不丢；任务可定时（recurring+一次性）；订阅额度用尽时 hold 并在重置后 auto-resume。
   - 为什么值得学：我们的「API 重启丢进行中 turn」是刻意取舍（Gen 3），但「排队消息」与「定时任务」与此正交，是控制面的刚需方向（远程管控价值 = 不在键盘前也能排活）。
   - 成本：中（队列持久化 + 生命周期钩子）。

6. **三档 diff + 行选注释回填 composer**【docs/user + Flavio 深评】
   - 是什么：per-turn diff（这条 prompt 改了什么）/ branch diff / unstaged diff 三档；文件或 diff 行选中 → 附评论进 composer，agent 拿到精确上下文。
   - 为什么值得学：review 循环是我们「工作台多视图 + git 工作区」的自然延伸；行选注释尤其提升「修改意见 → agent 修复」的精度，实现纯前端 + 现有 diff 数据。
   - 成本：低-中（per-turn 档依赖学习点 2 的 checkpoint refs）。

### B. 思路参考（中-高成本，需结合我们路线裁剪）

7. **delegate_task 跨 harness 子任务编排**：任意 provider 的 agent 可派生子任务（跨 provider 等待结果、父会话内答子审批）。与我们 OPC 多 agent 方向直接对口（memory: product-direction-opc-multi-agent），但他们建立在事件溯源 run/attempt 模型上，我们的 relay/live 模型需要先有「子线程归属 + 完成回流」的语义设计。参考其 capability 表对 subagents 的细分（exposesSubagentThreadIds/canWaitForSubagents…）。
8. **Guest 只读分享链接**：HMAC（thread+share id，server key）无状态 token，单线程只读 + 可提议消息，替换/关闭 share 即全体吊销，进不了 SessionStore。若我们要「把某个会话给同事看」，这是低成本好范式。
9. **配对与 scope 化会话**：一次性配对链接（QR/URL hash 用后即焚）→ 分 scope 的 session → 短时 WS ticket。我们目前单用户 tunnel 模型不需要，但若做多设备/多用户，scope 表（terminal:operate = shell as user！）值得照抄其设计而非自创。
10. **t3.json 项目级可入库配置**（scripts + previewUrl + worktree 策略 + schema URL 供编辑器补全）：把「项目内重复操作」从 UI 配置升为可 review 的代码。我们 pages/wiki 已走配置化，scripts/preview 可同构。
11. **终端保留上限与增量输出**：server 每终端 5000 行/8MiB 帽子 + 增量 chunk 事件 + 回放剥离 device query。我们 tmux attach 把 scrollback 留在 tmux（更强），但其「保留上限 + UTF-8 不劈码点」细节对我们 PWA 本地 buffer 有参考价值。
12. **server 自更新健康检查 + SQLite 快照回滚**：launcher 更新前快照、失败回滚。对我们 api 常驻 + 常升级的形态是运维层面的好实践。

### C. 与我们定位冲突（理解即可，不跟进）

13. **自有事件溯源 DB 作为会话权威**（SQLite projections 为真相，provider 会话仅 resume，外部会话一次性导入）：换来了跨 provider 统一时间线/全文检索/与 provider 解耦的 settle，但付出巨大复杂度（事件保留 ~1 天、快照恢复、schema 对存量环境兼容、迁移文档一堆 caveat）。我们「JSONL 唯一权威」是更简且更兼容的取舍——CLI 侧 resume 天然无损，禁止跟进此路线（与 constitution「数据源唯一」精神一致）。
14. **原生移动 app（RN/Expo + 商店）**：换来 Live Activities/widget/系统级推送，代价是双端原生工程 + 商店发版。我们 PWA 路线已定（多端同构、一次实现两端生效），Web Push + 深链可覆盖核心价值，不转向。
15. **Effect 全栈 + 自研 oxlint 插件 + vp 工具链**：类型安全收益真实，但与 Bun + TanStack 栈冲突，依赖面过大，不引入。
16. **libghostty-vt 终端渲染**：他们 PTY 直连（无 tmux），需要自建 scrollback 与渲染；我们 tmux attach 已把 scrollback/共享/多端尺寸问题服务端解决，无需换渲染层。

## 5. 社区反馈摘要（均标注证据强度）

**好评**（多源交叉，中-强证据）：
- 移动/远程体验是被引最多的核心价值：「remote into multiple machines and multiple models all from one place」「best mobile coding experience」【App Store 评论区（4.9 分 / 205 评分），强社区证据】；HN 用户称「desktop app and the mobile app experience… amazing, completely free, open source」【Ask HN agentic setup 2026-11 帖 + GLM-5.3 帖评论，中证据】。
- 多 provider 统一界面 + 多 agent 并行编排是推荐首因【r/ClaudeAI「Should I use Claude Code Desktop or T3 Code?」、stealwhatworks 增长分析，中证据】；有团队从 Claude/Cursor/Codex 各自官方 app 整体迁来【App Store 评论，弱-中证据】。
- 性能与「快」被反复提及（README 也以 performance 为红线）【YouTube 评测评论区，弱证据】。
- UI 被同行认可到衍生 fork（omp 作者：「I loved T3 Code's UI, then I forked」）【r/tui + r/PiCodingAgent，中证据】。

**吐槽/争议**（弱-中证据，多为社区转述）：
- iOS 用户要「background polling + 更好的 thread 组织系统」【App Store 评论，强社区证据】——线程组织与后台感知仍是痛点。
- 终端原生流用户「看不到 GUI 的意义」、疑虑遥测数据收集【YouTube 评论，弱证据】。
- 「community owned」宣传 vs 社区 PR 难合入的观感争议（CONTRIBUTING 明确只收小修，功能需先过 Ideas 讨论）【r/LocalLLaMA 嘲讽帖 + AGENTS.md/CONTRIBUTING【文档】佐证，机制为真、情绪为弱证据】。
- r/codex 「postmortem」帖指控 Theo/Maria 推动 OpenAI 移除 Codex 热门特性（社区戏剧，**未核实，弱证据仅存目**）。
- 对特定 provider 的适配质量差异（Pi 在 T3 内体验弱于 Codex）【r/PiCodingAgent，弱证据】——与「adapter 是最难部分」的官方自述互证。

**增长背景**：2026 年 Claude Code 采纳率 18%→39% 翻倍的窗口里，T3 以「免费 + 开源 + BYO 订阅 + 移动端」卡位多 agent 管理需求【stealwhatworks，中证据】。

## 6. 一句话对比

T3 Code 是「同一问题（网页/手机控制本机 agent）的另一个解」：他们用**原生三端 + 事件溯源 DB + 重适配器**换深度与规模（500k 用户、58.6k star），我们用 **PWA + JSONL 权威 + 轻管道**换简洁与 CLI 兼容。值得搬的是其**数据驱动的 provider 能力表、git-ref checkpoint、settle 注意力语义、感知状态推送**四件套；不值得跟的是其**自有 DB 权威、原生 app、Effect 栈**三座大山。

---

## 附：本报告源码引用索引（~/repos/t3code 内）

- `AGENTS.md` / `README.md` / `docs/internals/overview.md` / `docs/internals/providers.md` / `docs/internals/remote.md` / `docs/internals/environment-auth.md` / `docs/internals/terminal-runtime.md`
- `docs/user/mobile-notifications.md` / `docs/user/providers-claude.md` / `docs/user/permission-modes.md` / `docs/user/portable-handoffs.md` / `docs/user/thread-migration.md`
- `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts`（SDK 接入 + 进程组 spawn + 能力表）、`CodexAdapterV2.ts`
- `packages/effect-codex-app-server/src/protocol.ts`；`packages/provider-core/src/server/ProviderAdapter.ts`
- `apps/server/src/checkpointing/CheckpointStore.ts`、`apps/server/src/vcs/GitVcsDriver.ts`（write-tree/commit-tree/update-ref）
- `apps/server/src/relay/AgentAwarenessRelay.ts`、`apps/mobile/src/features/agent-awareness/remoteRegistration.ts`
- `apps/server/src/project/AgentSessionScanner.ts` / `AgentSessionImporter.ts`（外部会话导入）
- `apps/server/src/terminal/Manager.ts`、`apps/server/src/worktreesDirectory.ts`
