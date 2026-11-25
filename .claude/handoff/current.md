# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-25 14:35（**TUI env 注入修复批落地 `9275b392`**——bundle 终审
> 定案「本会话恒弹审批」真根因，env 值集 GUI/TUI 单源对齐；`506b1577` +
> `9275b392` 两个 commit 本地未推，**push 待用户确认** + 真机验证清单交用户）

## 一句话状态

T3 五批里程碑已 push（`feb993b4`）。此后 auto mode 插批两轮方向修正：`0a08b6c7`
（=0 注入，证伪）→ `506b1577`（撤 =0 + AUTO_MODE_MODEL「保险」）→ 本批
`9275b392`（bundle 终审：AUTO_MODE_MODEL 撞 safeguard 黑名单从未生效，连
「保险」一起撤；真根因 = **TUI spawn 零 env** → 分类器兜底落 gateway 缺省表
opus-4-7 网关不路由 → 恒弹人工审批；修复 = `buildAgentEnvOverrides` 单源 +
TUI 经 0600 `--settings` 文件 env 块注入）。**两个 commit 本地未推**。

## 本 session 焦点

### 五批里程碑（plan：`~/.claude/plans/toasty-sprouting-star.md`）

- **M1 停止终态一致**：状态机加 `turn_interrupted` 信号；claude-stream verbatim
  转发点登记 interrupt request；stdout control_response ack → 收口 done +
  endTurn(false)。探针实锤协议事实：plain interrupt → CLI 发
  `result{error_during_execution}`（协议文档旧文 "interrupted" 是字段名漂移，
  已修正）；interrupt ack 即收口，迟到 result 由 armed 窗口短路。
- **M2 Stop = 冻结队列**：shared 三上行消息（queue_hold/resume/discard）+
  `queue_held` 下行快照帧（broadcast-only，不入 liveLines）；relay
  heldCommands 状态 + holdCommands 改 void；web Stop 改发 queue_hold + chip 区
  「已冻结 N 条 · 恢复/放弃」。探针实锤：cancel_queued:true 回 ack
  `{still_queued, cancelled}` 且**无 result**（idle/running 同）。
- **M3 发送幂等**：`claimUserUuid` per-runtimeKey 台账（2000 FIFO），四入口
  （WS user 帧 / REST /message / admin session_send / auto-retry）统一 claim
  短路；REST/admin 入参加 `clientRequestId`（可选，向后兼容）。
- **M4 admin 天花板 + 血缘**：shared 档位归一表 + `resolvePermissionCeiling`；
  session_create 加可选 permissionMode（白名单单源）+ 天花板校验
  （`[MODE_ESCALATION_DENIED]`，target 档位未知 fail-closed）；SessionMetadata
  加 `createdBy` 血缘（parseMetadata 容忍归一化，零迁移）。
- **M5 收尾**：docs 四件（admin spec 两 Requirement + 协议文档 interrupt 事实
  修正 + design_spec §4.2 systemd control-group 表述 + redesign-v2 §6.19 记档）；
  code-reviewer + security-reviewer 报告消化 7 项修复（见下）。

### review 消化批（`d5e377e7`，7 项修复）

1. **armed flavor 区分**（code P1-1）：M2 后停止入口全走 cancel_queued（无
   result）→ ack 即删 armed；plain interrupt 打断 working/blocked 才保留
   armed 短路；idle interrupt 不留 armed。防 30s 窗口误吞后续自然 turn result。
2. **claim/release 对称**（code P1-2 + security P2-3）：ensureRunning/write
   抛错释放幂等键（WS + injectUserPrompt 两入口），防重试被谎报 dedup。
3. **dontAsk 档位 2→1**（security P2-1）：deepwiki 核对——不弹问询、未预批直接
   deny，比 default 严非宽；档位表 = plan/readonly=0 < default/manual/dontAsk=1
   < acceptEdits/auto=2 < bypassPermissions/full=3。
4. **permissionModes 真回填**（security P2-2）：`setClaudePermissionModes` 写回
   profile；fallback 白名单补 manual。
5. **审批卡 mode= 可见**（security P1-2）：summarizeControlInput 对
   permissionMode 特判恒进摘要（80 字符截断界内）。
6. **REST 档位白名单 provider 无关化**（security 相邻观察）。
7. 三小项：holdCommands 死接口 void 化、AdminSendOutcome import 单源、web
   cancel_queued 注释对齐探针事实。

**记档不修（已向用户说明）**：origin 伪造面（loopback 信任边界，per-session
token = 独立立项）；acp mode 白名单放行（休眠面，AcpSpawnTarget 无
permissionMode）。

### auto mode 全案终审 + TUI env 注入修复批（`506b1577` → `9275b392`）

- **bundle 2.1.325 终审推翻单变量实验归因**：分类器选择链（bFn）不读
  DEFAULT_HAIKU_MODEL——链 = 托管 → server-configured → env AUTO_MODE_MODEL →
  external sonnet probe → 兜底 Kj（**读 DEFAULT_OPUS_MODEL**）。此前「haiku
  映射即通」是 probe+兜底多分支接住的假归因（单变量实验只能证「注释后仍工作」，
  证不了「工作的是哪个分支」）。
- **AUTO_MODE_MODEL 从未生效**：safeguard 黑名单
  `["claude-sonnet-5-5","claude-opus-5-5","claude-opus-5"]` 拒显式 pin（静默
  忽略）——注入的 resolved.sonnet=5-5 恰撞名单。「显式保险」无效，已撤。
- **「本会话恒弹审批 vs GUI 自动审批」真根因**：TUI（tmux pane）spawn 零 env
  （`/proc` 实锤仅 BASE_URL）→ 兜底 Kj 读不到 OPUS env → 落 gateway per-provider
  缺省表 opus→claude-opus-4-7 → 网关（5-5 代映射）不路由 → 分类器请求失败 →
  每步人工审批。GUI env 全套 → 兜底=opus-5-5 → 自动审批。
- **修复（`9275b392`）**：`buildAgentEnvOverrides` 单源（AUTH_TOKEN +
  PROVIDER_MANAGED_BY_HOST + BASE_URL + 模型三件套，无 AUTO_MODE_*）；GUI 走
  buildSpawnEnv 继承后覆盖；TUI 经 resolveTuiSpawn 返回 `{args, env}`，agent-tui
  写进既有 0600 `--settings` 文件顶层 env 键（CLI flagSettings 消费，bundle
  实锤合并链；凭证落文件而非 tmux -e——argv 有 ps 暴露面，用户拍板）。
  buildTuiHooksSettings → buildTuiAgentSettings。全门禁绿（api 1431/shared 18/
  web 1098），api 已 respawn。
- memory `gateway-no-haiku-automan-check-fails.md` 已重写为 bundle 终审版。

## 下一步

1. **push 待用户确认**（待推 = `506b1577` + `9275b392` 两个 commit）。
2. **真机验证清单（交用户）**：
   - 停止：running 中点停止 → 状态立即收口（不再悬挂 working）+ 排队条目变
     「已冻结」chip；停止后立刻发新消息 → 正常执行不误吞。
   - 队列冻结/恢复/放弃：A 端 running 中排队多条 → 停止 → B 端见冻结 chip；
     恢复 → 按序重发；放弃 → 清空。
   - auto mode：web UI 开新 auto mode 会话，让 agent 跑需要工具的任务 →
     不弹审批自主执行、无「safety check does not run」。
   - **TUI 恒弹审批**：现有 terminal 形态会话切「回到对话」再切 terminal
     （pane 重建吃到新 env）→ 工具执行不再逐步要审批。**当前正在跑的旧 pane
     不受影响（env 不热更）**。
3. **trust 询问问题挂账（用户明确不算结案）**：22router 会话 headless spawn 后
   卡在 trust folder 询问（GUI 不询问、TUI 询问；`hasTrustDialogAccepted:true`
   却仍询问的矛盾未解释）——classifier 修复已收尾，回头立项排查。
4. 全量 e2e 查漏补缺（非必须——改动面 4 spec 已全绿；全套留到下个里程碑收尾）。

## 挂账（非本批）

- 真机验证清单（pages 五条 + 渐进披露五条，gtd @mcp-apps 组）仍待用户。
- checkpoint 批 / settle 批（已推送）待真机验收。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- mock 了 overview 的其它 e2e spec 未补 sessions-stream mock（实锤一条修一条）。
- pages 域 + 外部 MCP server 管理批（2026-11-17 完成）待提交 + 真机验证。
- t3code 调研 A 组可学习清单剩余项待用户拍板排期。
- **#9 回流编排**（跨会话委派）：本轮只埋 createdBy 血缘字段，编排随 OPC 立项。
- **#3 重启恢复定案**：大批独立立项（systemd control-group 已隐式兜底）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-25 14:35 / 触发原因：TUI env 注入修复批（9275b392）落地 +
auto mode 全案 bundle 终审定案，阶段收尾 handoff。
