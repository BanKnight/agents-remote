# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-13（**插件页更新体验批完成待 commit/push**——chip 收拢 + Apple
> Store 详情布局 + /plugins/updates 批量清单页 + 检查更新**任务化**（用户否决 60s 超时
> 方案：长耗时服务端操作必须走任务/查询机制），探针 118 pass / 全门禁绿 / 真实链路冒烟
> 通过；前批：DiagFab 开关批 `aff9a75` 已推送）

## 桌面技能详情批（2026-11-12，两轮修复待 commit/push）

- **用户报障**（桌面 /plugins/skill/$）：①搜索进已装技能详情，内容过长没法滚动；
  ②没法返回；③无单独更新入口（体感「一更新就全更新」）。
- **第一轮根因与修复**：桌面 mainPage 详情渲染 tab 时代组件 `SkillTabPreview`（只读
  Markdown）——`section.flex-1` 在 MainPageShell children 容器（`min-h-0 flex-1`，非
  flex container）下失效 → 内层 `overflow-y-auto` 无高度约束不滚（frontend-notes §8
  家族）；且无 nav 返回/更新 CTA/停用/卸载入口。修复：桌面复用 `MobileSkillDetail`
  （对齐「桌面 MCP 详情复用 MobileMcpDetail」先例，多端同构）；服务端 update 本就是
  单技能 `skills update <name> --global --yes`（非全量）。
- **第二轮（用户反馈「点更新→更新中→静默变回不知道结果；单个更新按钮也没看到」）**：
  ①详情页自动检测（MobileSkillDetail autoChecked effect：缓存空**或 staleTime 60s 窗口外**
  时自发 refetch，ref 守卫防失败重试死循环；限速纪律不变——手动/自动共享同一 queryKey）；
  ②检测结论行（检查中 / 已是最新 / 检测失败 error 文案）；③更新终态反馈：成功
  「✓ 已更新到最新版本」常驻（hook 乐观 hasUpdate:false 曾让 CTA 块整体消失零提示）、
  失败保留按钮可重试 + error 行；④两个挂载点（WorkbenchRoute / mobile-workbench）加
  `key={name:projectName}` 防 mutation 状态跨技能粘滞（同实例换参路径）。
- **code-reviewer 四条全消化**（通道恢复）：P2-1 结论行让位更新流程态（成功后「已是
  最新」与「✓ 已更新」不再同屏）；P2-2 自动检测触发条件补 `isStale`（防「已是最新」
  基于陈旧比对结果，hooks/skills.ts 注释同步改写）；P3-3 mutation 粘滞 → key 根治；
  P3-4 探针 json() 202 实参静默丢弃（helper 单参恒 200）→ 注释与实参修正。
- **验证**：探针 probe-v2-m6-plugins.mjs **118 pass 全绿**（含第三批 C1-C3 chip 几何 /
  D10-D11 固定头 / D12 更新后 chip 消失 / Part 9 U1-U7 清单页全流程）。format / lint
  0 warning / typecheck / 全量单测 exit 0（api + web 1081 + shared）/ CSS 硬闸 /
  tokens 机检全绿；产物落盘（rg plugins.updatesTitle 命中 WorkbenchRoute chunk）。
- **第三轮（用户三条真机反馈，2026-11-12）**：
  ①列表卡「有更新」chip 悬卡中间——根因 flex 多 `margin-left:auto` 均分剩余空间，
  「有更新」与「来源」两 chip 被拉开；修复 `.pcard .upd + .upd { margin-left: 6px }`
  相邻收拢成右端一簇（只有首 chip 吃 auto 推右）。
  ②详情页更新/卸载钮沉底要滚动——按 Apple Store app 页布局重排 MobileSkillDetail：
  固定头（dtitle chip + dmeta + 检测结论行 + 更新/卸载并排操作行，`flex-none`）+
  滚动区（ddesc + 停用开关 + SKILL.md 正文，`min-h-0 flex-1 overflow-y-auto`）；
  操作行 utility（`m-0 min-w-0 flex-1`）覆盖 components 层 .cta/.rm（CSS layer 序：
  utilities 在 components 后）。
  ③黄色「n 个更新 ›」点击原为再检测一遍不符合直觉 → 新增 `/plugins/updates` 清单
  深度页（SkillUpdatesView 单源两端复用：路由三处注册 router.tsx /
  workbench-model.ts pluginView:"updates" / WorkbenchRoute + mobile-workbench 分支）；
  组头黄钮改导航。清单页支持逐项更新（卡内钮）+ 全部更新（组头钮，**顺序 await** 不
  并发——避免同时 spawn 多个 git clone；单 mutation 实例驱动多项：reset +
  setActiveName，error 行挂最后失败项卡下；成功项由 hook 乐观置 false 自动出列）。
  自动检测 effect 与详情页同式（缓存空或 staleTime 窗口外自发一次，ref 守卫）。
- **code-reviewer 第三批审查消化（无 P0/P1，1 P2 + 8 P3 全处理）**：
  P2-1 updateAll 中间失败项提示被吞（共享 update.error + activeName 前移：A 失败 B/C
  成功 → A 残留无说明）→ per-item `itemErrors: Record<string,string>`（失败 set、重试
  开始 delete），activeName 只承担「更新中」指示；P3-2 终态文案条件改 `isSuccess &&
  !hasUpdate`（自动补检又检出新版时按钮必须回来，updateNote 同步对齐）；P3-3 自动检测
  effect 注释对齐实际语义（「挂载期内首次满足 stale 条件检测一次」——进页 fresh 不置
  ref，停留超 staleTime 后 isStale 翻转补检一次）；P3-4 两钮底缘差 2px（.rm 显式 42 挡
  stretch）→ `h-11 leading-[42px]` 显式 44 + border 补偿居中（h-auto + leading-44 实测
  46——border 加进 auto 高，reviewer 建议方案不成立，探针补等高断言锁住）；P3-5
  pluginView 三处类型副本 → workbench-model 导出 `PluginView` 单源；P3-6 全部更新钮
  执行中换「更新中」+ opacity-60；P3-7 整页错误改 `error && !data` 才接管（data 在场
  时列表保留 + 顶部小行，对齐详情页行为）；P3-8 两页重复自动检测 effect → 抽
  `useAutoCheckSkillUpdates(agent, projectName?)` 进 hooks/skills.ts；P3-9 探针 U2
  waitForTimeout → waitForURL。
- **验证（消化后）**：探针 **118 pass 全绿**（含新等高断言）；format / lint 0 warning /
  typecheck 三包 / 全量单测（api 1316 + web 1081 + shared 13）/ CSS 硬闸 / tokens 机检
  全绿；产物落盘（leading-[42px] 在 WorkbenchRoute chunk、CSS content-type text/css）。
- **第四轮（用户报「检查更新 → 检查中 → 又变回检查更新，过一会黄字才出现」，2026-11-12）**：
  **实测根因（第一手 curl）**：`GET /api/skills/updates` 服务端逐 repo 串行拉 GitHub Trees，
  首次 22.7s / 二次 6.2s；而 `fetchJson` 默认超时 **8s** → 首次必然 abort（「检查中」提前
  归零 + 按钮复位、无结论），React Query `retry: 1`（query-client.ts）静默重发第二次才
  成功 → 黄字迟到 = 用户看到「状态自己跳回去」。~~第一版修复（60s 超时）被用户否决~~
  **（用户拍板：「长耗时服务端操作理应使用查询/任务机制，不是无脑延长时间」）→ 终版
  修复 = 检测任务化，与 install/update 同链**：`POST /api/skills/updates` 立即返 202
  `{taskId}`（startCheckTask，dedupKey=`check:<agent>`），后台跑
  `checkSkillUpdates` → `skillTaskRegistry.finish(done,{updates})`，结果**随 SSE done 帧
  带回**（免二次查询，late-join 立即收当前态帧）；客户端 `checkSkillUpdates` 改 POST +
  `waitForSkillTask`（**签名不变** → hooks/UI/乐观更新全零改动），POST 用默认 8s（秒回）。
  shared 加 `CheckSkillUpdatesStartResponse`；`SkillTaskFrame.kind` 加 `"check"` +
  `updates` 字段。列表页 `updates.error` 可见行保留（检查失败不再静默）。**真实链路
  冒烟**：POST 202 秒回 10.7ms → SSE running 帧 → done 帧带完整 updates 数组；真实
  浏览器时序：按钮 t+0.3s 进「检查中…」**全程不复位**直到终态 chip/黄字出现，无跳变。
  回归锁 = client.test.ts 两条任务链单测（POST+body / done 透传 / failed reject）+
  skill-update.test.ts POST 用例（202/终态 updates/joined 去重/非法 agent 400）。
- **探针排障沉淀（第三批）**：①断言顺序依赖状态时序——更新流程乐观置 hasUpdate:false
  会改列表态，chip 断言必须排在更新流程之前（D7 返回挪前）；②同行断言比较两钮自身
  top 而非容器 top（操作行带 pt-3）；③等宽断言放 ±2 容差——两钮 flex 声明相同 +
  总宽精确吻合但 Chromium 分配 174/176（引擎内部行为，诊断实锤非代码 bug）；④一次性
  诊断脚本三坑：/tmp 下 import "playwright" 解析到 bun cache 无浏览器二进制（须放
  scripts/ 用项目 @playwright/test）、route 兜底 `/.*/` 后注册 LIFO 短路全部 mock、
  密码读 deploy-config 的 readAppPassword()。

## DiagFab 诊断面板开关批（2026-11-12，✅ 已推送 `aff9a75`，真机验收通过）

- **需求**（用户原话）：「诊断用的悬浮按钮，在诊断面板也加一个开关，随时关掉这个功能」。
- **实现**（diag-fab.tsx 单文件 +21 行）：DiagPanel 顶部加开关行（role="switch"），
  调既有 `setDiagEnabled`（diag-log.ts：内存 + localStorage `ar-diag-enabled` 持久化 +
  DIAG_ENABLED_EVENT 广播）；视觉复用 shell-primitives `toggleSwitchTrackClasses/Knob`
  （与设置页 DiagnosticsSection 同源同构）；label 英文硬编码（组件头既有决策「诊断件
  不进 i18n」）。
- **语义**：面板内点关 → 广播 → DiagFab return null → 球与面板一起消失（组件头注释
  「开关关闭即整条消失」既定语义）；再开走设置页 DiagnosticsSection（既有入口）。
- **门禁**：web typecheck / diag-log 9 pass / lint 0 warning / format / CSS 硬闸 /
  tokens 机检全绿；产物落盘验证（entry chunk 含 "Diagnostic log"、CSS content-type
  text/css、1.375rem utility 在盘）；**code-reviewer 通过零发现**（关闭链无竞态/泄漏、
  双端一致、面板永不出 off 视觉帧——点击即整树卸载）。
- **注意**：scripts/probe-fab.mjs 是旧「新建入口 FAB」探针，与 DiagFab 无关，挂账
  互不影响。

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
- **技能更新检测服务端慢**（第四轮实测：首次 22.7s / 二次 6.2s，大头 = 逐 repo 串行拉
  GitHub Trees）：已任务化（前端无长 fetch、状态不跳变），但「检查中」仍会持续十几秒；
  可考虑服务端并发 fetch 或结果短 TTL 缓存。非本批范围，待拍板。**边界（reviewer 提出）**：
  服务端无总超时（仅每请求 20s abort），repo 很多时最坏可能超过客户端 320s guard——guard
  先 reject、任务继续跑、重试 join 同一任务（自愈），体感是重复报错；届时一并治（服务端
  总超时或并发拉取）。
- StatusDot/StatusMarker（shell-primitives）休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- ~~规则库进化候选~~ ✅ 已落地（2026-11-12）：dev-environment.md「测试内存上限」条目
  改写为 cgroup 唯一推荐（ulimit -v 对 bun/JSC 过紧，OOM 假 fail 群 + SIGILL 判定口诀）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
