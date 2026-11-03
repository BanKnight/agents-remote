# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-03（⚙ gate 放开 + hook 限内存 + agent-browser 残留治理，均已完成）

## 一句话状态

**本 session 三批工作全部闭环**：
① ⚙ gate 放开（`8c1ddf2`，agent TUI 模式 composer 恒渲染 ⚙）——已 push，等 iPhone PWA 真机验证；
② pre-commit test 限内存（`bf8af55`，systemd-run 2G cgroup 包裹）——已 push，commit 假挂根治；
③ agent-browser 残留治理（rules `47e2770` + bashrc `AGENT_BROWSER_IDLE_TIMEOUT_MS`）——
daemon 架构根因实证后三层落地，**systemd timer 全局清扫方案被用户否决（多项目机器有误伤面）**。
swap 治理完成（462MB → 208.6MB）。

## 本 session 焦点

### 关键决策（不可丢）

- **gate 恒渲染安全的论据**：`SessionDetail` 全仓仅 2 消费者（`TerminalPanel` 真终端 /
  `AgentTerminalPanel` = claude TUI 模式 + 老 tmux codex），全是 TUI 形态——无需按
  sessionType 分支。
- **sessionId 前缀是稳定类型标识**：`inferSessionTypeFromId` 只认 `agent_` / `terminal_`
  前缀（workbench-model.ts）——mock/测试造 id 必须带对前缀，否则 focus 面板类型推断
  undefined、面板不渲染（本批探针首跑挂 1 场景的真根因，非产品回归）。
- **agent-browser 是 daemon 架构**：CLI 命令跑完即退，daemon（PPID=1）+ Chrome 常驻，
  `close` 是唯一正规清理；`AGENT_BROWSER_IDLE_TIMEOUT_MS` 只回收 daemon **不杀 Chrome**
  （daemon 退后 Chrome 变孤儿 ppid=1）——已实证（idle timeout 10s 实验：daemon 退、
  Chrome 孤儿存活）。Chrome 收尾只能靠收尾纪律 `agent-browser close`（rules `47e2770`）。
- **残留治理三层定案（用户拍板）**：① rules 收尾纪律（`agent-browser close` 必跑）；
  ② bashrc `AGENT_BROWSER_IDLE_TIMEOUT_MS=1200000`（20 分钟空闲 daemon 自退兜底）；
  ③ systemd timer 全局定时清扫孤儿——**用户否决：「这种做法不可以，毕竟我们是多项目的」**
  （定时清扫在同机多项目环境有误伤面）。已验证 bash -ic 读到 1200000；对之后新拉起的
  shell/daemon 生效。
- **swap 构成与处置**：462MB = agent-browser Chrome 212MB（17.8 天）+ codegraph 94MB
  + novels 58MB（用户指示不动）+ vite 残留 40MB 等；清理后 208.6MB。驻留进程冷内存
  换出是内核正常回收非泄漏；512Mi swap 偏小是顶满放大器（扩容 2G 仅建议过，未拍板）。
- **pre-commit 限内存**：hook 内 systemd-run 2G cgroup + 探测 fallback；勿用 ulimit -v
  （rolldown WASM 虚拟地址预留会 OOM）。

### 进度

- ✅ ⚙ gate 放开批 `8c1ddf2`（SessionDetailRoute.tsx 三处 + workbench-model.ts 注释
  4 处 + 新探针 probe-session-gear-gate.mjs 5/5 绿 + code-reviewer 消化 + 全门禁）已 push
- ✅ pre-commit 限内存 `bf8af55`（hook + 快速通道判定不变）已 push
- ✅ agent-browser 收尾纪律 rules `47e2770`（verification.md 新节：close 必跑 + daemon
  机制边界 + 孤儿判定 + pkill 转义防自匹配 + 临时 dev 进程同理）已 push
- ✅ swap 清理：杀 agent-browser Chrome 孤儿 / codegraph / vite 残留（novels 未动），
  释放 ~253MB
- ✅ bashrc 写入 `AGENT_BROWSER_IDLE_TIMEOUT_MS=1200000`（内置 Edit，含根因注释）+
  生效验证（bash -ic → 1200000）
- ✅ memory 落盘 `agent-browser-close-after-use.md`（feedback 类）
- ✅ /handoff save（本次）

### 阻塞 / 风险

- 工作区剩 handoff/current.md 滚动态（本文件）。
- **pre-commit test 已自带限内存**（`bf8af55`）：首次 commit 假挂根因 = api test 进程
  SIGKILL（swap 全满 + chromium 探针残留高压瞬时叠加；OOM killer 是最合理假设非实锤，
  kernel 日志 deploy 无权限读）。现在无限制重跑也全绿 = 瞬时压力非确定性。
- agent-browser idle timeout 只防 daemon 永生，Chrome 孤儿防不住——防线是 rules 收尾
  纪律（用完 `agent-browser close`），已在 verification.md 落地。

## 下一步

1. iPhone PWA 真机验证 ⚙：agent 会话切 terminal 模式，展开输入抽屉 → 控制行左端 ⚙，
   点开见键盘/命令双 tab 面板。
2. 通知自愈两批（`d3eb1d4` + `630db9b`）仍在等真机被动观察验证。
3. 遗留：v1.7 真机验证清单反馈（含平板长按探针盲区）；wiki/ 目录 git 归属；
   swap 扩容 2G（仅建议，未拍板）。

## 易丢的关键上下文

- **workbench session detail 路由统一**：agent/terminal 同走 `/projects/$key/session/$id`
  （旧薄壳路由已删成 redirect）；面板类型由 id 前缀推断。
- **进程清理防自匹配**：`pkill -f` 模式含目标字符串会杀到自己 shell——用 `chrome[-]151`
  方括号转义；`pgrep -f` 同理误匹配，用 `pgrep -x agent-browser-l`（进程名 15 字符截断）。
- **孤儿判定**：Chrome 主进程（cmdline 不含 `--type=`）ppid=1 且 etime 分钟级以上；
  发现即杀主进程（子进程随之退出）。
- **探针等待纪律**：lazy 挂载一律 `waitFor visible` 替代固定 sleep；`.qkey` 断言用
  `textContent === "Tab"`（hasText "Tab" 撞内置键 "Shift+Tab"）。
- 单测限内存：`systemd-run --scope --user -p MemoryMax=2G bun run test`（含 git commit
  整体套壳跑 pre-commit）。
- 排障方法：探针挂 ≠ 产品回归——先给探针加失败 dump + HTTP ≥400 监听定位探针自身问题。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
