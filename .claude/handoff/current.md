# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-12 10:15（**「已停仍显示执行中」排障定案 + 根级 overview 兜底
> 轮询修复 `003ee20` 已推送**——待用户硬刷新拿新 SW 验证）

## 排障定案（2026-11-12「切不了/执行中」，不可丢）

- **服务端无罪（后台任务实锤）**：turn 结束 4 分钟后 `status=done` + 状态文件最后
  事件 `Stop`——hooks/watcher/状态机全链健康。inotify watch 挂着（/proc fd 933→
  状态文件 inode）、PostToolUse 实时写、`spawnInitialStatus`/`nextAgentSessionStatus`
  纯函数正确。
- **真根因 = 前端 status 冻结**：api respawn 断壳 WS → 旧前端无断线自愈（P1-1 未达
  设备）→ **项目视图无任何 REST 兜底**——`useGlobalInstanceCandidates` 的 10s 轮询
  `enabled:isGlobal` 只覆盖全局视图（M10 注释声称的兜底实际只挂那一处）+
  `refetchOnWindowFocus:false` 全局关 → status 冻结成断线前旧值，模式切换菜单
  `busyBlocked` 误报「执行中」（服务端 done 已 59 分钟——transcript END_TURN 08:40
  vs 用户报障 09:39）。
- **修复 `003ee20`**：WorkbenchRoute 根级常驻 overview observer（10s、无条件
  enabled）——与 useSessionShells 并列作纵深闸；探针 `probe-overview-fallback-poll.mjs`
  锁「项目视图 15s 内 ≥1 次 interval 请求」。
- **取证方法论**：①后台任务 sleep 后读磁盘 = 「turn 结束后 Stop 链」决定性判据；
  ②transcript END_TURN 时间戳重建 done 窗口；③`/proc/<pid>/fdinfo` inotify ino
  反查 watch 目标；④登录探针必须 locale:zh-CN（headless 默认 en，中文 label 不命中）。
- **未解支线**：09:39 的 recordActivity（updatedAt 整分钟戳）来源未定位——terminal
  形态不该有 claude-stream/stdout 驱动链；不影响主判决，挂账观察。
- **规则库进化候选（/evolve）**：「前端 status 类缓存必须有与 WS 主通道解耦的周期
  兜底，且兜底 observer 的 enabled 条件不能随视图 scope 收窄」——M10 教训升级版。

## 一句话状态

用户报障「通知很久没收到、开关自己变关（另一用户同样）」→ 根因锁定 WebKit 静默推送
惩罚（sw.ts 前台抑制 + 坏帧 return，3 次不出通知 → Safari 撤权，计数永不清零）→
用户拍板一步到位 A+B：A = SW 每推必显（buildPushNotification 纯函数 + 坏帧兜底卡 +
showNotification 拒绝最小参数重试，删前台抑制）；B = 抑制上移服务端（sessions-stream
visibility 帧 {deviceId, visible} → hub 连接级记账 → PushNotifier fail-open 过滤盯屏
设备）；顺带 push 链路诊断（pushDiag 双层 + SW postMessage 中继回页面 + 设置页 mount
探测 + reconcile denied smoking gun 行）。全部实现 + 两份 reviewer 报告消化完毕，
五项修复（P1 断线自愈 + P2×3 + P3 尺寸闸）落地并全门禁绿，**待用户确认 commit/push**。

## 本 session 焦点

### 关键决策（不可丢）

- **A 段**：通知构造单源 `web/src/lib/push-notification.ts`（零依赖，SW bundle 独立
  打包）；title/body 非空才算合法帧（空显示字段按坏帧出兜底）；前台附 `silent:true`
  仅桌面（iOS 不支持忽略无害）；sw.ts 无任何「不出通知就 return」路径。
- **B 段**：协议 `SessionShellsStreamClientMessage`（shared）；hub `Map<socket, entry>`
  连接级记账（close 即清无 TTL）；notifier 过滤 **fail-open**（无 deviceId / 不在集合 /
  getter 缺省或抛错一律照发）；**gone-prune 必须用 targets[i]**（过滤后索引错位会误删
  未发送订阅——已有回归测试锁）。
- **visibility 帧三重职责**：①可见性状态 ②连接保活（该流原本无客户端帧，Bun
  idleTimeout 255s 空闲断开）③新鲜度（iOS 冻结 → 帧停 → 连接死 → 服务端清 →
  fail-open 恢复）。周期 25s（复用 HEARTBEAT_INTERVAL_MS）+ open 首发 + 翻面即发；
  send 不排队（readyState!==OPEN 丢弃）。
- **review 消化（五项全采纳）**：P1-1 sessions-stream 断线自愈（照 use-approvals：
  模块级 reconnectTimer + 500ms + 防重入 + refCount>0 守卫 + 归零 clearTimeout——
  可见性面无 REST 兜底，断线不自愈 = 抑制失效直到 remount）；P2-2 parsePushPayload
  只留 json() 返回 unknown（形状判定单源 buildPushNotification）；P2-3
  installPushDiagRelay 模块级 installed 守卫；P2-4 pushPermission() 存局部变量；
  P3-1 hub.message parse 前尺寸闸 4096 字符（顺带消除 echo 回弹放大）。

### 进度

- ✅ 计划批准后 A+B+诊断全部实现（shared/sw/push-notification/push-diag/push/
  settings-dialog/hub/index/notifier/use-session-shells/main）
- ✅ 三个 subagent 补全测试（hub 9 用例 / notifier visibility 6 用例 / shared client
  信封 / use-session-shells 6 用例 FakeWebSocket + jsdom 双 realm）
- ✅ security-reviewer（无 P0/P1/P2，1 P3 已修）+ code-reviewer（无 P0，1 P1 + 3 P2
  已修）消化完成
- ✅ 自查修掉：disconnect 无条件 detach 错杀（改 refCount===0 才 detach）+ index.ts
  [ws] 日志刷屏（sessions-stream 分支移到日志之前）+ lint unused 变量
- ✅ review 修复后自补 3 条测试：hub 尺寸闸（形状合法但 >4096 parse 前丢弃）+
  use-session-shells 断线自愈两用例（500ms 重建+首发 / pending 期间 disconnect 取消）
- ✅ 全门禁绿：format:check / lint 0 warning / typecheck 三包 / 测试 **api 1316 +
  web 1081 + shared 13 全 pass** / CSS 硬闸 / tokens 机检；产物落盘验证（sw.js 含
  fallback retry 特征、WorkbenchRoute chunk 含 "(flip)"，mtime 23:00）

### 易丢的关键上下文

- **bun test 全量在 `ulimit -v 2097152` 下 OOM 连锁 → bun JIT SIGILL 崩溃（
  `RangeError: Out of memory`）**——本机 18G/available 10G 也复现；改用
  `systemd-run --scope --user -p MemoryMax=2G bun run test`（cgroup 物理内存，JIT
  虚拟地址保留不占额）稳定全绿。**dev-environment.md 的「systemd-run/ulimit」二选一
  中，全量 test 应选 systemd-run**（ulimit -v 是虚拟地址空间限制，对 bun/JSC 过紧，
  此前能过属侥幸）。
- use-session-shells 的 Edit 曾出现 `export` 悬空挂到新插注释前的损坏（old_string
  从 `function` 起匹配吞掉 `export ` 前缀）——修复后已验证；**大段替换时 old_string
  必须从完整语句边界起**。
- sessions-stream 上行帧进 hub.message（index.ts message handler 顶部 kind 分支，
  在 [ws] 调试日志**之前** return——25s 帧不刷日志）。
- site/（pages 根内容）untracked 不入库——commit 时勿顺手 add。
- code-reviewer 提醒已核实：site/ 仅一个 index.html，与本批无关。

## 下一步

1. **push 通知 = 长期观察期**（用户 2026-11-12 拍板）：修复已全部生效，核心验收
   （前台连续 >3 条开关仍开 / 两设备互不干扰）靠日常使用自然验证。观察期内若再报
   「收不到」：先开悬浮球诊断读 push 缓冲（visibility flip / settings probe /
   reconcile denied 三类行），再查服务端 `[push] … skipped` 日志——三层一手数据
   定位后再动手，勿凭推理开修（§22 纪律）。
2. **前置提醒仍在**：iOS 端被 Safari 撤销过的权限需用户在系统设置手动重开（代码
   只能自愈订阅，撤销的系统权限救不了）；手机端需硬刷新一次让新 SW 接管。
3. 挂账推进（见下）。

## 挂账（非本批）

## 挂账（非本批）

- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- StatusDot/StatusMarker（shell-primitives）休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- ~~规则库进化候选~~ ✅ 已落地（2026-11-12）：dev-environment.md「测试内存上限」条目
  改写为 cgroup 唯一推荐（ulimit -v 对 bun/JSC 过紧，OOM 假 fail 群 + SIGILL 判定口诀）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
