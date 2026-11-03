# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-03（幽灵 blocked bug 修复完成，review 消化完毕，待 commit/push）

## 一句话状态

**「请先确认上方操作但上方无卡」幽灵 blocked bug 根治**：pending 事实源从客户端投影
（part.controlRequestId + result/isInterrupted）换成**服务端 ApprovalRegistry 快照**
（`/api/approvals` + approvals-stream WS）。客户端谓词收束为 shared
`isUnresolvedControlRequest` + adapter `isLivePendingControlRequest` 单源；服务端
登记入口放开到全部 can_use_tool（复杂工具也登记，过滤上移到中心投影层）。真机确认
22router 会话已恢复正常。

## 本 session 焦点

### 关键决策（不可丢）

- **根因链**：control_request 仅存 stdout 不落 JSONL → CLI 死亡后 part 的 result
  永不到达；`applyToolLifecycle` 对 controlRequestId part **永久豁免 interrupt** →
  纯客户端谓词把幽灵 part 当待确认 → composer 永久 blocked。服务端 registry 实测
  空（approvals count: 0）= 权威事实「无人在等」。
- **方案 H（服务端快照 gate）**：route 层 `useApprovals(true)` → `aliveControlRequestIds`
  传入 `useClaudeSession` options；`aliveIds === null`（快照未就绪）回退纯谓词不误杀
  活请求。曾否决 v1（isRunning gate）：live 段重放 assistant 行会恒 true、delta 空重放
  活请求会误解除，不可靠。
- **review P0（快照内容不完备）**：registry 登记入口原过滤 ExitPlanMode/AskUserQuestion
  （不进中心）→ 快照永不含其 id → 活请求被误判幽灵。修在服务端：**全部登记** +
  过滤上移投影层（`snapshot()` 只投影一键可答卡；PWA push 回调同样只对一键卡发）。
  会话内计划/提问卡应答走 WS 转发路径（`unregisterForwarded` 现在能真正注销它们）。
- **用户指示（收束原则）**：多处使用的状态判断必须收束单源——落成 shared
  `isUnresolvedControlRequest`（四处散写→单源）+ adapter `isLivePendingControlRequest`
  （composer blocked 与审批托盘共用）+ 计划/提问卡 `awaiting` 同谓词（本地补充态
  isOrphaned/isError 归入 isInterrupted）。

### 进度

- ✅ 根因定位（JSONL 零孤儿 + registry 空 + 探针不复现 = 幽灵投影实锤）
- ✅ 客户端：shared 谓词 + adapter 单源谓词 + route 接线 + use-approvals `loaded`
  + 金框两处口径统一（tool-ui-registry / SystemChatBubble）
- ✅ 服务端：登记入口放开 + snapshot/push 投影过滤（approval-center）
- ✅ review 消化：P0 服务端完备性 / P1 两处卡片散写收敛 / P2 loaded 测试补齐；
  P2（WS 断线 ~15s 快照陈旧窗口）评估为可接受（15s REST 兜底），暂不做连接态回退
- ✅ 门禁：typecheck 三包 + api 1272 / web 1023 / shared 12 全绿；format/lint/
  tokens/CSS 硬闸全过；web 产物完整重建（18:12）+ ar-dev-web respawn
- ✅ ar-dev api respawn（新登记逻辑已加载，health ok）；真机确认 22router 恢复
- ⏳ 待办：commit（改动 9 文件）+ push（需用户确认外发）

### 阻塞 / 风险

- 无阻塞。已知边界：WS 断线期间快照最长陈旧 ~15s（活请求 blocked 有延迟窗口）；
  幽灵 tool 卡的金框/等待横幅（tool-ui-registry）未叠快照门禁（纯视觉，无 composer
  级危害），如真机反馈再治理。

## 下一步

1. commit + push（用户确认外发后）。
2. 遗留：v1.7 真机验证清单反馈；wiki/ 目录 git 归属；swap 扩容 2G（仅建议）+ 构成复查。

## 易丢的关键上下文

- **pendingInteraction 单源链**：shared `isUnresolvedControlRequest`（谓词本体）→
  adapter `isLivePendingControlRequest`（+快照门禁）→ pendingInteraction /
  collectPendingApprovals；测试在 claude-adapter(.hook).test.ts「服务端审批快照」段。
- **快照门禁三分支语义**：空 Set = 否决幽灵；null = 未就绪回退纯谓词；含 id = blocked。
  `useApprovals.loaded`（query.data !== undefined）是空/未就绪的区分开关。
- **服务端登记口径**：registry 保留全部 can_use_tool 事实；只有中心投影
  （snapshot + onApprovalRegistered push）过滤复杂工具——别把过滤挪回入口。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:api|web`（runbook）；重启 api 会杀
  挂着的 CLI（--resume 找回，用户已知情）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
