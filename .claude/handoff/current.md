# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-04（取证通道升级为**入屏横幅**——手机 PWA 无 console，
> 三行日志关键行进 localStorage 环形缓冲 + 流内 banner；全门禁绿待 commit/重建）

## 一句话状态

**22router「全部已中断/已失效」回放缺陷调查**：桌面四路径 + 真实数据臂式模拟
全绿无法复现；用户设备唯一分叉 = 回放路径第一手。用户手机看不了 console →
取证通道升级为入屏横幅（ReplayDebugBanner）：adapter 三行日志关键行同步写
localStorage（24 条环形）+ CustomEvent，ClaudeChat 流内横幅显示最近 audit 行
（unpaired>0 标红）。**等 commit + web 重建 + 用户设备横幅数据判读。**

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **22router 调查取证结论（桌面全部证伪，勿重走）**：①JSONL 配对完整
  （38990/38993）；②四路径臂式模拟全绿（`/tmp/merge-arm-sim.mjs`：D full 45/45、
  B 缓存+delta 38/38、E 半turn+delta 自愈、X 缓存单独 38/38）；③锚 miss→full 时
  客户端 `resetSessionState()` 整体重建 =「旧段消失」而非「中断卡」——**「整批中断」
  只能来自合并窗口真缺一批 result**；④客户端 full/delta 分支：`session_init.replay`
  delta+cursor 命中→保留 state，否则 reset。
- **22router resume 边界结构（CLI 2.1.299 实测）**：gap 后 `queue-operation`（无
  uuid 带 ts）→ user 消息；resume 后 5min compact_boundary → "This session is being
  continued" summary user 行；`last-prompt`/`mode`/`atis-latch`/`cost-state` 无 uuid
  state 行对客户端管道无害。服务端窗口=最后 compact block（现 11-02 16:53→EOF），
  客户端缓存可含窗口外老段（窗口错位是结构现实）。
- **取证通道两批**：console 三行日志（`6a835b0`，session_init replay/anchor/cursor、
  cache restored/miss、live_end audit）→ **入屏横幅批（本批未 commit）**：
  `web/src/lib/replay-debug.ts`（localStorage 环形 24 条 + CustomEvent +
  resetReplayDebugForTests）、adapter 4 处 recordReplayDebug 接线、
  ClaudeSessionDetailRoute 的 `<ReplayDebugBanner />`（折叠摘要=最近 audit 行，
  unpaired>0 红底；点开 pre 显示全部带 HH:MM:SS 行）。+5 单测全绿。
  判读：**unpaired 大批>0 = 数据层实锤；恒 0 仍见中断 = 渲染层**。
- **bun test jsdom 跨 realm 坑**：Bun 全局 `new CustomEvent()` 不是 jsdom Event
  实例 → jsdom dispatchEvent 拒绝（"not of type 'Event'"）——dispatch 用
  `window.CustomEvent`（从目标 realm 取构造器，浏览器语义不变）。
  bun:test 无内置 DOM：手动 JSDOM 挂 globalThis（pinned-sessions.test.ts 范式）。
- **审计数据源陷阱**：live_end 时点 `rawMessagesRef` 滞后（commit 后 effect 才镜像），
  必须用 `messageMapRef`（processBatch Phase 1 同步维护，带 uuid 行全覆盖）。
- 用户否决「配对审计自愈弃缓存」方案 1（打补丁）；取证日志（不改行为）获准。

### 进度

- ✅ `6a835b0` console 三行日志 commit + web 已重建（含该批产物）
- ✅ 入屏横幅批：replay-debug.ts + adapter 接线 + banner + 5 单测 +
  format/lint/typecheck/全 test（web 1039）/CSS 硬闸/tokens 机检 全绿
- ⏳ 待办：commit → `tmux respawn-pane -k -t ar-dev:1` 重建 web（**不碰 api**）→
  产物特征串验证（`rg "ar-replay-debug" web/dist/assets/`，chunk=
  ChatSessionDetailRoute-*.js）+ curl CSS content-type → 交用户
- ✅ agent-browser 已 close

### 阻塞 / 风险

- 用户 CLI（22router 会话）还在跑——**api 绝不能 respawn**；22router 会话本身
  绝不能建 resume 实验（会和活 CLI 并发写 JSONL）。
- push `6a835b0` + 本批需用户确认外发。
- 定位后**整批摘除**取证通道（§22 纪律：replay-debug.ts 两文件 + adapter 4 处
  record + banner 组件）。

## 下一步

1. commit 本批 → respawn web → 产物验证 → 用户重开 PWA 拉新 bundle。
2. 用户打开 22router 会话 → 聊天流顶部横幅直接可读 → 拍屏/转述判读：
   init 行 replay=full|delta 切分路径；audit 行 unpaired>0 数据层 / =0 渲染层。
3. 遗留：真机验证 checklist 反馈（脱壳批）；v1.7 清单；wiki/ git 归属；swap 扩容。

## 易丢的关键上下文

- **web chunk 布局**：claude-adapter 打进 `ChatSessionDetailRoute-*.js`（文件名
  与内容不符——claude+chat 共享）；`rg "特征串" web/dist/assets/` 直查。
- **22router JSONL**：`~/.claude/projects/-home-deploy-workspace-22router/`
  `6d09c971-....jsonl`（1.2GB 单文件无 fork，今天还在写=用户 CLI 活着）。
- **臂式模拟行索引基准**：扫描窗口 2321=boundary(11-01 20:17)、2543=最后 11-01 行、
  2544=queue-operation、2555=boundary(15:27)、2824=boundary(16:53)。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:0|1`；**不能在用户「优化 remote」
  CLI 运行时重启 api**。
- **大文件扫描工具链**：2G ulimit -v 会挂 bun——用 systemd-run cgroup MemoryMax；
  1.2GB JSONL 用「流式 + 尾 8MB 切片」。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
