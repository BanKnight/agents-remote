# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-19 10:28（首载骨架分派 + TUI error 红点滞留修复，3 commit 未推）

## 一句话状态

**TUI 圆点红点滞留根因修复（`776cd8b`）+ agent+terminal 首载骨架按形态分派（`872170b`）**。用户批评「圆点不该这么多 bug，是方案问题」——定位实锤：TUI 与 chat 两条采集链信号不对称，`turn_continue` 被窄化成 approval_settled（只服务 blocked），error 滞留无自愈。已升格独立信号对齐 chat 链 turn_activity 完备度。

## 本 session 焦点

### 关键决策（不可丢）

- **TUI/chat 采集链信号对称性（2026-10-19 红点修复的核心教训）**：同一语义「turn 存活」在 chat 链 = `turn_activity`（assistant 帧，error/done→working 自愈，blocked 下忽略），在 TUI 链 = `turn_continue`（PostToolUse 系）。修复后 `turn_continue` 是独立信号：blocked→working（settled 本源：审批通过工具才执行）+ error/done/idle→working 自愈 + working 幂等 + closed 吸收。**与 turn_activity 的唯一语义差异 = blocked 下有效**（工具真执行了 = 审批真解决了；chat 的 assistant 帧在 blocked 下必须忽略，否则谎报审批已解决）。
- **红点完整机制链（2026-10-19 用户真机反馈「在跑却红点」）**：StopFailure（turn 因 API 错误结束）→ `turn_error` → metadata error → CLI/agent 恢复继续跑，PostToolUse 持续触发但旧映射翻不回 working → error 滞留到 turn 结束 Stop→done。**agent 自主连续干活（用户不输入）的会话尤其重灾**（无 user_input 信号来翻正）。本会话（remote）自己就是受害者。
- **「在跑」口径（用户拍板）**：agent = turn 在飞（`isTurnActive`：working/blocked）；terminal = 进程存活（running）。`countsAsRunning` 单源。
- **标题圆点跟聚焦类型走（`3cb505a`）**：聚焦 agent/terminal 会话 = 会话状态点；skill/空态维持 runct 项目指示。
- **composer 抬高 bug**：已修复（`832708e`，init 800ms 短窗复核）+ 自动哨兵；等真机 `[inset-debug]` 数据，定案后拆临时诊断件。
- **首载骨架分派（`872170b`）**：已知 terminal 形态直接显终端遮罩（`TerminalStatusOverlay` 从 SessionDetailRoute 导出复用），聊天骨架只服务 chat/omp/未知。形态来源优先级：detail 缓存 → agent 列表缓存 → overview 缓存 → `instanceNameMemoAtom` sidecar（localStorage，覆盖 PWA 冷启动缓存全空）。边界：首次打开（memo 也没有）仍闪一次聊天骨架。

### 进度（本 session 累计 8 commit）

- ✅ `8d2d98e` 会话状态数据层修正（三层根因 A/B/C + mode 透传）
- ✅ `da916b5` code-review 消化（P3 三项）
- ✅ `3cb505a` 移动标题圆点跟聚焦类型走
- ✅ `0413fae` + `832708e` composer 取证角标 + 修复 + 自动哨兵
- ✅ `c051fd9` idle 文案「空闲中」+ 恢复历史初始态 done（已 push）
- ✅ `04b4568` handoff（未推）
- ✅ `872170b` 首载骨架按形态分派（web 三文件；全门禁绿 + CSS 硬闸 ✓ + 落盘 content-type ✓）
- ✅ `776cd8b` TUI turn_continue 独立信号（api 四文件；api 992/web 828/shared 10 全绿）
- ⏳ **3 commit 未推**（04b4568 / 872170b / 776cd8b）——等用户确认后 push

### 待办

- **push 3 commit**（待用户确认）
- **真机验收**：① TUI 会话再遇红点是否自愈（PostToolUse 一触发即翻 working；前端刷新仍依赖 refetch，见下）；② 后台打开 TUI 会话首载直接显终端遮罩不闪聊天骨架；③ 标题圆点状态色；④ 22router/novels 红点（数据层已自愈，本轮修复后不会再产生）
- **已知残留面（未修，待用户决策）**：terminal 会话状态变化**无 WS 实时推送**（chat 链有 session_status 帧 injectLiveLine 广播，terminal 只落盘 metadata + 推送通知）——前端圆点更新靠 REST refetch（staleTime 60s / refetchOnWindowFocus）。metadata 快照修复后已正确，滞留的只是前端刷新窗口。要做实时需 terminal 链接通广播（relay 已销毁，需新通道），改动面较大。
- **composer 哨兵观察**：等 `[inset-debug]` 数据 → 定案后拆临时诊断件
- 历史挂起：推送通知跳转偶发失败（等第一手数据）；PWA 通知清单剩余项

## 易丢的关键上下文

- **overview API curl**：auth 走 HttpOnly cookie（fetch 同源自动携带），token-secret 文件不是 curl 头。
- **api runDir** = `/run/user/1000/agents-remote/`；agent-status/ 下是 TUI hooks 瞬时 token 文件（`cat` 即读当前信号），sessions/ 下是权威 metadata。
- **本会话 TUI pane（agent_c73156）hooks 是新版**（08:32 spawn，含七 hook）——红点修复对它即时生效。
- **cloudflared 归 systemd 管**（`Restart=on-failure`）。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 bun 不用 node；编辑一律内置 Read/Edit/Write。
- **哨兵链路**：web badge hook → api `/api/debug/inset-report` → `console.warn("[inset-debug]")`；查 tmux ar-dev api pane 或 journald。
- **状态机测试注意**：agent-tui.test.ts 的 watcher 集成测试偶发 fs.watch 时序 flaky（首跑挂重跑过），非代码问题。

---
最后更新：2026-10-19 10:28（触发原因：首载骨架 + 红点修复双批落地，3 commit 待推）
