# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-24 23:15（**T3 spec 参考清单五批里程碑全部完成**——M1-M4 功能批
> + M5 docs/review/回归收尾 + auto mode 修复插批，HEAD = `0a08b6c7`，**push 待用户
> 确认**；剩余待办 = 真机验证清单交用户）

## 一句话状态

T3 Code spec 参考清单（A 档）五批里程碑全部落地并本地 commit：M1 停止终态一致
（`0f03ba46`）→ M2 Stop=冻结队列（`399e0be5`）→ M3 发送幂等（`2295efce`）→ M4
admin 特权天花板+血缘（`ce9fc424`）→ M5 docs 批（`2201e6d5`）+ review 消化批
（`d5e377e7`，7 项修复）+ auto mode 修复插批（`0a08b6c7`，用户插话需求）。全门禁
+ CSS/tokens 硬闸 + 改动面 e2e 全绿。

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

### auto mode 修复插批（`0a08b6c7`，用户插话需求）

- 根因（用户修正）：新版 CLI auto mode safety check 默认走 server-side
  classifier 且无本地 fallback，上游网关不支持 → 恒 422。此前归因「网关不路由
  haiku」是同链表层现象。
- 修复：`buildSpawnEnv` 缺省注入 `CLAUDE_CODE_AUTO_MODE_SERVER=0`（父 env 显式
  设值时尊重父 env）；范围 = headless spawn，TUI 零 env 注入纪律不动。
- memory `gateway-no-haiku-automan-check-fails.md` 已更新为新根因。

## 下一步

1. **push 待用户确认**（HEAD = `0a08b6c7`，7 个 commit 待推：0f03ba46 → 2201e6d5
   → d5e377e7 → 0a08b6c7）。
2. **真机验证清单（交用户）**：
   - 停止：running 中点停止 → 状态立即收口（不再悬挂 working）+ 排队条目变
     「已冻结」chip；停止后立刻发新消息 → 正常执行不误吞。
   - 队列冻结/恢复/放弃：A 端 running 中排队多条 → 停止 → B 端见冻结 chip；
     恢复 → 按序重发；放弃 → 清空。
   - auto mode：新会话（重启 ar-dev-api 后 spawn）auto mode 不再报
     「safety check does not run」。
3. 全量 e2e 查漏补缺（非必须——改动面 4 spec 已全绿；全套留到下个里程碑收尾）。

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

最后更新：2026-11-24 23:15 / 触发原因：T3 五批里程碑 + review 消化 + auto mode
插批全部完成，阶段收尾 handoff。
