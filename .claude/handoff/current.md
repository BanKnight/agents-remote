# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-03（幽灵 blocked 二次根治：架构从服务端快照门禁转向聊天流自洽作废机制，实现完成、门禁全绿，reviewer 审查中）

## 一句话状态

**幽灵 blocked bug 按用户架构指引二次根治**：pending 只看聊天流——session_init 帧新增
`anchor` 锚落点字段，delta 回放 + anchor="history"（实时段重启）→ 客户端把旧实时段全部
未决 control_request 帧标 stale → 投影层补 isInterrupted → shared 谓词自动解除，composer/
托盘/金框/计划提问卡零 gate 全部正确。快照门禁链（aliveControlRequestIds /
isLivePendingControlRequest / route useApprovals 接线 / loaded）已整体撤除，审批快照退回
审批中心本职。门禁全绿（typecheck 三包 / api 1272 + shared 12 + web 1023 / CSS 硬闸 /
tokens），api/web 已 respawn，产物验证含新代码零旧残留。**待 commit（含未 push 的
483e66c 基础上叠加）；code-reviewer 审查中，消化报告后再 commit。**

## 本 session 焦点

### 关键决策（不可丢）

- **用户架构否定（核心）**：方案 H（服务端审批快照 gate）是错的——「composer 的状态
  不应该两边各取一半，而是只看聊天流」；「为什么你需要在轮询那里获取数据打补丁，这是
  不是说明聊天流缺乏下发某些数据」。解法指引：「聊天记录有分组标签（实时/历史），cli
  重启后信息只能在历史里看到不会在实时出现——你是有足够信息做判断的」「服务端在切到
  tui 模式也等于 cli 重启，对应的数据也要清理」（TUI 清理服务端已有 clearRuntime）。
- **新方案（用户已赞同「我赞同你的方案，很合理」）**：control_request 仅存 stdout 不落
  JSONL，户籍在实时段。session_init 加锚落点 `anchor:"live"|"history"|null`（服务端
  locateReplayAnchor 返回 buffer 的一行显式化）；delta 回放 + anchor="history" = 实时段
  重启 → markStaleControlRequests 把旧实时段全部 control_request 帧标 stale →
  renderChatStream 盖章处对未解决（result === undefined）part 补 isInterrupted →
  isUnresolvedControlRequest 自动 false。
- **安全性论证**：delta 分支内 anchor=history ⟺ 进程重启（compact 清空双缓冲与
  LIVE_BUFFER_CAP trim 都使锚 miss → full，不经 delta 分支）；「进程活着 + 锚落 history」
  不存在，无误杀活请求面。批次形状 (0,0)/(0,N) 歧义论证了必须由 session_init 显式带锚落
  点（纯客户端推断不可靠）。
- **作废语义**：标 isInterrupted（保留「曾有一个未答请求」痕迹）——写进 state 一条路径，
  全部消费点自动正确；已回填 result 的 part 不改写（完成态优先）。
- **保留自方案 H**：服务端 ApprovalRegistry 全量登记 + 中心投影过滤（approval-center），
  这是审批中心本职，与 composer pending 无关。

### 进度

- ✅ shared：session_init 类型加 anchor?；ClaudeControlRequest 加 stale?（客户端本地语义
  注释）；isUnresolvedControlRequest 消费点注释更新（作废机制取代快照门禁）
- ✅ api/session-relay.ts：addSubscriber 的 session_init 帧加 `anchor: anchor?.buffer ?? null`
- ✅ web/claude-adapter.ts：markStaleControlRequests 纯函数（结构共享 + 幂等）；session_init
  delta 分支 anchor==="history" → setRawMessages 作废；盖章处 stale + result undefined →
  isInterrupted；撤 isLivePendingControlRequest / aliveControlRequestIds options；
  pendingInteraction 回归纯谓词（type 守卫 + shared 谓词）
- ✅ route 撤 useApprovals 接线；use-approvals 撤 loaded（审批中心本职保留）
- ✅ 测试：hook 测试换锚落点作废（重连三分支：首连 blocked → anchor=live 保留 →
  anchor=history 解除）；纯函数测试（stale 标记幂等 + stale→interrupted 集成 + 已解决
  不改写）；relay 测试 8 处 session_init 断言补 anchor；删 loaded/aliveIds 测试
- ✅ 门禁：typecheck 三包 + format + lint + 测试 api 1272 / shared 12 / web 1023 全绿 +
  CSS 硬闸 + tokens 机检；api/web respawn；产物 rg 验证（markStaleControlRequests 在、
  aliveControlRequestIds/isLivePendingControlRequest 零残留）+ CSS content-type text/css
- ✅ 协议文档：claude-cli-stream-protocol.md 增量回放段补锚落点 anchor 说明
- ⏳ code-reviewer 审查中（重点：作废时序竞态 / 误杀面 / 撤除链完整性 / full 回放路径）

### 阻塞 / 风险

- 无阻塞。全量测试曾出现一次 web 1 fail（expect toBe），单跑与复跑均绿——偶发测试间
  干扰，与本次改动无关（此前 session 已有同类顺序依赖修复记录），真复现再治。
- 已知边界（继承自方案 H 分析）：replay cache 冷启动恢复窗口的幽灵存活到 session_init
  到达（毫秒级）后清除，可接受。

## 下一步

1. 消化 code-reviewer 报告 → 修复发现项 → commit（标准 `git add && git commit`，含
   483e66c 之上叠加；尾行 Co-Authored-By: Claude Opus 4.8 (1M context)）。
2. push 需用户确认（外发）。
3. 真机验证清单交用户：22router 幽灵会话页刷新后 composer 应不再 blocked（该会话
   current.pending 已被服务端 clearRuntime 清掉；若 CLI 已死，重连后走 full/作废路径）。

## 易丢的关键上下文

- **作废机制单链**：session_init.anchor（服务端 relay）→ claude-adapter delta 分支
  （anchor==="history" → markStaleControlRequests）→ renderChatStream 盖章处
  （stale + result===undefined → isInterrupted）→ shared isUnresolvedControlRequest 自动
  false。测试：claude-adapter.hook.test.ts「session_init.anchor 实时段重启作废」段。
- **快照门禁已死**：aliveControlRequestIds / isLivePendingControlRequest /
  useApprovals.loaded 已全删——别再按 current.md 旧版本（snapshots/20261103-2149.md）
  恢复那套接线。
- **registry 登记口径不变**：全部 can_use_tool 登记、中心投影（snapshot + push）过滤
  复杂工具——composer 不再消费快照，勿把过滤挪回入口。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:api|web`（runbook）；重启 api 会杀挂着的
  CLI（--resume 找回，用户已知情）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
