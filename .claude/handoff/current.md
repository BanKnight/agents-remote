# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-19 12:45（会话壳统一推送通道落地，5 commit 未推）

## 一句话状态

**会话壳统一同步通道（壳/内容分离）落地**：`d188af3`（shared+api：`/api/sessions/stream` 全量快照广播）+ `a2baaa5`（web：`use-session-shells` 订阅 + 拆 chat 流 session_status 寄生）。用户拍板架构：**会话作为壳（元数据），内容有内容自己的通道；壳状态不论 chat/TUI 一套方式同步，不寄生 chat 消息流**。端到端探针 8/8（创建→广播→缓存→DOM、close→移除）+ e2e 30/30 全绿。

## 本 session 焦点

### 关键决策（不可丢）

- **壳/内容分离架构（2026-10-19 用户拍板）**：壳元数据（status/mode/displayName/close）统一走 `/api/sessions/stream` 全量快照推送；内容（chat stream-json / tmux attach 字节流）各自通道。「一套方式」的落点 = **广播挂 SessionRegistry 层**（`onMetadataChanged` 回调）：任何采集源（chat 状态机/TUI hooks/rename/close）经 registry 写入自动进同一推送通道，runtime 层零感知广播。
- **listAllShells 纯读（广播环禁破坏性）**：`listAllCandidates` 的 `keepIfRuntimeExists` 有 `removeMetadata` 副作用（快照→删→onMetadataChanged→再广播的递归面）——广播用新建的 `listAllShells`，只从快照排除判死 entry，不删 registry（清理仍归 overview REST）。
- **SessionShellHub 同帧跳过**：registry 回调含 recordActivity/setModel 等非壳可见变更——`runBroadcast` 与上帧 JSON 比对相同跳过 send；`sendSnapshot` 也更新 `lastFrame`（否则订阅后第一次同内容广播会重发，单测实抓）。
- **前端保鲜机制换了、渲染管道零改动**：WS 帧 → `projectShells` 投影直写 `["overview"]` 缓存（从 prev 继承 subtitle——快照无该慢填充字段）+ diff invalidate 列表/detail。detail query 60s staleTime 的保鲜通道 = status/displayName 变化时 invalidate detail key。`statusToV2DotClass`/`countsAsRunning` 消费点全不动。
- **turn 状态标量拆除**：claude-adapter 的 sessionStatus useState/seed_init 折入/session_status 帧分支/`bridge.getSessionStatus` 全删；effort 确认门两入口改读 `detail.status`（广播 invalidate 保鲜，天然同源）。SessionDetailRoute 的 status 帧收敛 transport-only（api 侧仅发 connected）。

### 进度（本 session 累计 10 commit）

- ✅ `8d2d98e` 会话状态数据层修正 / `da916b5` review 消化 / `3cb505a` 标题圆点 / `0413fae`+`832708e` composer / `c051fd9` idle 文案（已 push）
- ✅ `04b4568` handoff / `872170b` 首载骨架按形态分派 / `776cd8b` TUI turn_continue 独立信号
- ✅ `421a5ae` handoff
- ✅ `d188af3` 会话壳统一推送通道（shared+api；8 files）
- ✅ `a2baaa5` 会话壳推送订阅 + 拆 session_status 寄生（web；9 files）
- ⏳ **5 commit 未推**（04b4568 / 872170b / 776cd8b / 421a5ae / d188af3 / a2baaa5——共 6 个，其中 421a5ae 是 handoff）——等用户确认后 push

### 待办

- **push 未推 commit**（待用户确认）
- **真机验收**：① TUI 会话 turn 结束时圆点 working→done 亚秒级跟随（本通道）；② 后台打开 TUI 会话首载直接显终端遮罩；③ 标题圆点状态色；④ 红点自愈
- **composer 哨兵观察**：等真机 `[inset-debug]` 数据 → 拆临时诊断件
- 历史挂起：推送通知跳转偶发失败（等第一手数据）；PWA 通知清单剩余项

## 易丢的关键上下文

- **⚠️ bun --watch 不因「新建文件」触发重启（2026-10-19 实证）**：`session-shell-hub.ts` 新建不在 import graph，靠 index.ts import 行变更触发；本次实测 api 一度跑旧代码（判据 = `/api/sessions/stream` 无 upgrade 头时响应体格式：旧 fallback 与全局 auth 守卫同为嵌套 `{"error":{"code"...}}`，**不能凭 401 判新代码**；正确判据 = 带 cookie + Upgrade 头得 101）。改 api 后交付前必须 `respawn-pane -k -t ar-dev:0` 并验证新代码生效。
- 端到端探针模式（本次已删，方法可复用）：Playwright 登录 → `page.on("websocket")` 捕获 `/api/sessions/stream` framereceived → 页面内 fetch 创建/关闭 test 项目 terminal 会话 → 轮询帧与 DOM。
- **api 全量 test 偶发 1 fail**（agent-tui.test.ts fs.watch 时序 flaky，单跑/重跑全绿）；commit 重试即可。
- **overview API curl**：auth 走 HttpOnly cookie；token-secret 文件不是 curl 头。`/api/sessions/stream` 直接 GET（无 Upgrade 头）返回全局 auth 守卫的嵌套 401，属正常。
- **api runDir** = `/run/user/1000/agents-remote/`；agent-status/ 是 TUI hooks 瞬时 token 文件，sessions/ 是权威 metadata。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 bun 不用 node；编辑一律内置 Read/Edit/Write。
- **tmux**：`ar-dev:0` = api、`ar-dev:1` = web；标准重启 `respawn-pane -k`；绝不 kill server。

---
最后更新：2026-10-19 12:45（触发原因：会话壳统一推送通道两 commit 落地，门禁+e2e+端到端全绿）

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
