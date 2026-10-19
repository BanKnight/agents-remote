# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-19 08:06（composer 修复 + 自动哨兵落地，5 commit 未推）

## 一句话状态

**composer「无故抬高」bug 修复 + 自动哨兵落地（`832708e`）**：keyboard-inset.ts 挂载 800ms 短窗复核（治 init 单点采样踩启动瞬态 vv）+ off>0 记录落 localStorage 并 POST `/api/debug/inset-report` 打服务端日志（用户零操作）。等待真机哨兵数据验证后拆临时诊断件。

## 本 session 焦点

### 关键决策（不可丢）

- **「在跑」口径（用户拍板）**：agent = turn 在飞（`isTurnActive`：working/blocked，TUI 空闲不算）；terminal = 进程存活（running）。`countsAsRunning` 单源，6 个消费点。
- **标题圆点跟聚焦类型走（2026-10-19 用户拍板，`3cb505a`）**：聚焦 agent/terminal 会话 = 会话状态点（`statusToV2DotClass`，与 ▾ 浮层行同源）；skill/空态维持 runct 项目指示。旧「runct 恒绿」设计被用户否定。
- **composer 抬高 bug 机制链（已定案并修复，`832708e`）**：通知入口 10-17 上线（`591da88`/`75890b2`）→ `focusOrOpen` 的 `client.navigate` 被 SW `navigateFallback`（sw.ts:24）拦成**完整文档加载** → 页面挂载 init 单点采样踩「启动/恢复瞬态 vv」（`vv.height < innerHeight` 短暂成立）→ 写入非零 offset；切会话同 path 不 remount（router.tsx:313）无重采样 → 卡住；键盘周期事件到达即自愈。**「为何半年没问题」= 入口 10-17 才有**。修复 = init 采样后 800ms 短窗复核（每帧幂等写回）；验证 = 自动哨兵数据（不再是用户手动读角标）。
- **「修复 + 自动哨兵」（2026-10-19 用户 AskUserQuestion 拍板）**：偶发场景用户手动等复现成本高 → 哨兵自动收数据（off>0 → localStorage 环形 20 条 → POST 临时端点 → api `[inset-debug]` 日志）；临时诊断件（角标 hook + api 端点）**定案后一并拆除**。
- **浮层黄点（blocked）实锤**：本会话 TUI pane 的 hooks settings 是旧版（pane 10-18 14:02 spawn，早于 `8d2d98e`；CLI 只在 spawn 时加载 hooks）——旧 Notification 无 matcher，turn 中任何 CLI 通知都被写成 approval → working 翻 blocked。turn 结束 Stop→done 自愈；根治 = 用户择机切形态换新（会杀掉本会话进程）。
- **530 事件（2026-10-19 晨，已解决）**：旧 tunnel 进程（非 systemd 承载）死亡，死因无 journal 记录；用户重启恢复。现在 tunnel 由 systemd `cloudflared.service` 管（`Restart=on-failure`）。web/api 全程健康。

### 进度（本 session 5 commit，均过全门禁）

- ✅ `8d2d98e` 会话状态数据层修正（三层根因 A/B/C + mode 透传；端到端实跑验证）
- ✅ `da916b5` code-review 消化：P3 三项（blocked 注释理由修正 / PostToolUseFailure 补挂成七 hook / mobile-sheets 冗余收敛）；review 结论「无 P0-P2」
- ✅ `3cb505a` 移动标题圆点跟聚焦类型走
- ✅ `0413fae` composer 取证角标（临时诊断件）
- ✅ `832708e` composer 修复（init 800ms 短窗复核）+ 自动哨兵（localStorage 环形 + POST `/api/debug/inset-report` → api console.warn）；43012 构建落盘已验证（`init-settle` 在 entry、`inset-report` 在会话路由 chunk、CSS content-type 正常）
- ⏳ **5 commit 未推**（origin/main ahead 5）——等用户确认后 push

### 待办

- **composer 哨兵观察**：用户真机正常使用（零操作），下次 composer 再抬高时查 api 日志 `[inset-debug]` 行判读（判读口径见 `use-composer-inset-debug-badge.ts` 文件头注释）→ 确认修复有效/若复发按数据定位 → 定案后拆临时诊断件（`use-composer-inset-debug-badge.ts` + 三路由挂载点 + api `/api/debug/inset-report` 分支）
- **push 5 commit**（待用户确认）
- 真机验收清单：① 标题圆点状态色；② 浮层黄点自愈（本 turn Stop 后）；③ 存量 TUI 切形态后状态流转；④ 22router/novels 下个 turn 红点消除
- 历史挂起：推送通知跳转偶发失败（等第一手数据）；PWA 通知清单剩余项；mod 采集批 / 插件管理 UI 等功能批候选

## 易丢的关键上下文

- **overview API curl**：auth token 不是 `token-secret` 文件（curl 返回 `{"error":...}`），auth 走 HttpOnly cookie（fetch 同源自动携带）。
- **api runDir** = `/run/user/1000/agents-remote/`（XDG_RUNTIME_DIR 派生，`runtime-dir.ts`）；agent-settings/agent-status 在其下。
- **本会话 TUI pane（ar-agent-claude-agents-remote-bd3bacc9-agent_06e39a）hooks 仍旧版**——别 respawn 该 pane（= 杀本会话）；黄点噪音 turn 结束自愈。
- **cloudflared 现归 systemd 管**：`systemctl status cloudflared`；旧手动进程已不在。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 bun 不用 node；编辑文件一律内置 Read/Edit/Write（本 session python 脚本改文件被分类器拦）。
- **哨兵上报链路**：web badge hook（HttpOnly cookie 自动携带，无需 token 头）→ api `/api/debug/inset-report`（`/api/` 统一守卫后分支，自动鉴权）→ `console.warn("[inset-debug]", ...)` 截断 4KB。查日志：tmux ar-dev api pane 或 journald。

---
最后更新：2026-10-19 08:06（触发原因：composer 修复 + 自动哨兵批落地，5 commit 待推）
