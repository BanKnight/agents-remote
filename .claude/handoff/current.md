# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-13（**更新清单页 App Store 反馈范式批已实现完毕、全门禁绿、
> reviewer 双报告全消化，待 commit + 用户真机验收**）

## 更新清单页 App Store 反馈范式批（2026-11-13，代码完成待 commit）

- **缘起**（用户原话）：「你为什么不参考苹果商店的设计呢？他们的 ui ux 在这方面就很棒」
  → AskUserQuestion 四项全选拍板：①就地进度环 ②全部更新队列编排 ③完成出列过渡
  ④检测按钮转圈。plan mode 批准后实现。
- **形态四点**（详见 docs/design/redesign-v2.md §6.18 决策日志）：
  ①按钮 sizer 锁宽（inline-grid 双 span 叠放，恒渲染隐藏「更新中…」定宽）——「更新」↔
  进度环零跳版（探针实锤点击前后 57.875px 逐像素相等）；
  ②批量进行中非当前项「排队中…」+ `.queued`（batchMode 区分单项/批量；**排除
  itemErrors 失败项**——批量中已失败项显排队是谎言态）；
  ③完成行两相位出列：绿 tint + ✓ 持留 DONE_HOLD_MS=400ms → `.updrow` grid 1fr→0fr
  塌缩 150ms（= --duration-exit，JS/CSS 同值互指）→ 真删行；donePhase/exitPhase
  ReadonlySet 续命渲染（乐观更新只翻 hasUpdate 布尔，sourceUrl 无损无需快照）。
  **约束记档**：持留窗口依赖 updates query `enabled:false + 60s staleTime`——未来加
  refetchOnMount/refetchInterval 会撕掉续命行；
  ④检测中 spinner（border-current 跟随按钮文字色）。
- **实现落点**：mobile-plugins-updates.tsx 状态机重写（batchMode/donePhase/exitPhase/
  timersRef per-name 定时器卸载 cleanup）；v2-primitives.css 末尾「16 更新清单行反馈」
  小节（sizer/.queued/.updating/.pcard.done/.updrow 塌缩，全语义 token）；i18n 加
  `plugins.updateQueued`；mobile-plugins-home.tsx 组头两处检测钮 spinner。
- **reviewer 双报告全消化**：
  - design（1 P1 + 2 P2 + 1 P3）：P1 排队态 ink-3×opacity-60 叠乘 1.27:1 近不可读 →
    color 升 `--ink-2` + `opacity:1` 豁免（排队=等待中信息态非不可用）；P2 done 持留窗
    蓝绿打架 → `.pcard.done .upd` 裸 `--c-success` ✓ + 透明底；P2 环被
    disabled:opacity-60 弱化 → `.updating` class `opacity:1`；P3 SR 静默 → done 相位
    按钮 `aria-live="polite"`。
  - code（1 P2 + 5 P3）：P2 探针 U11a tint 过渡（~120ms）竞态 → 有界重试轮询（15ms×20，
    相等即过；exit 相位不动 bg 故超 hold 窗仍成立）；P3 renderItems 死分支 → 简化为
    `u.hasUpdate || done || exit` 三支各表一来源；P3 U9/U4 断言弱（hasText 恒真/空等）→
    等目标态 `.queued` locator + face 文字精确断言；P3 批尾 550ms 头部计数瞬态不一致
    （chip=待更数语义正确、空转无副作用，维持）；P3 卸载后僵尸 timer 无后果（React 18
    no-op + 550ms 自灭，维持）；P3 spinner 三处内联（engineering §1 克制新增，维持）。
- **验证**：探针 probe-v2-m6-plugins.mjs **128 pass 0 fail**（Part 9 U1-U13b：双项 mock
  检测帧延迟 800ms / 更新帧 1200ms、U8 宽度逐像素、U11a parseColor 归一 #hex8↔rgba
  硬比对、U12 DOM 移除硬闸、U13 深链 auto-check）；format / lint 0 warning / typecheck /
  全量单测 1083 pass / CSS 硬闸 / tokens 机检全绿；产物落盘（rg polite 命中
  WorkbenchRoute chunk——**教训**：rg 特征串别带引号，minify 引号形式会吞命中）。
- **待办**：commit（含 attribution 尾行）→ push（用户确认）→ 真机验收清单交用户。

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

更新清单页 App Store 反馈范式批（就地进度环/队列编排/完成出列/检测 spinner）实现 +
reviewer 双报告消化完毕、全门禁绿，待 commit + 真机验收。

## 本 session 焦点

### 关键决策（不可丢）

- App Store 四项形态 + §6.18 约束记档（updates query enabled:false + 60s staleTime
  是持留窗口的前提，动了会撕行）。
- 排队态排除失败项（itemErrors）；DONE_EXIT_MS=150 与 --duration-exit 同值互指。
- 双主题/双端单源成立（SkillUpdatesView 移动 pluginView 与桌面 mainPage 复用）。

### 进度

- ✅ 设计文档先行（redesign-v2 §6.18 + design_spec §3.5 bullet 16）→ i18n → CSS →
  状态机 → 检测 spinner → 探针 Part 9 扩展（U8-U13）
- ✅ 全门禁绿 + 探针 128 pass（含 reviewer 修复后复跑）
- ✅ reviewer 双报告全消化（design 1P1+2P2+1P3 修；code 1P2+2P3 修，3P3 维持记档）
- ⏳ commit + push（用户确认后）+ 真机验收清单

### 易丢的关键上下文

- **bun test 全量必须 `systemd-run --scope --user -p MemoryMax=2G`**（ulimit -v 对
  bun/JSC 过紧 → OOM 假 fail 群 + SIGILL）。
- rg 搜产物特征串别带引号（`rg '"polite"'` 因 minify 引号形式不命中，`rg polite` 才
  准）；「build ready 没等到」先双向核对源码/产物再断 watch 假死。
- site/（pages 根内容）untracked 不入库——commit 时勿顺手 add。
- 探针 mock 延迟 fulfill（setTimeout 后 r.fulfill）合法且是相位类断言的关键手段。

## 下一步

1. commit + push（用户确认）；真机验收清单：①点更新钮就地转环不跳版 ②全部更新
   队列推进（当前项转环/其余排队中）③完成行绿 tint → 塌缩滑出 ④检测中 spinner。
2. 挂账推进（见下）。

## 挂账（非本批）

- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- **技能更新检测服务端慢**（首次 22.7s / 二次 6.2s，大头 = 逐 repo 串行拉 GitHub
  Trees）：已任务化（前端无长 fetch、状态不跳变），但「检查中」仍会持续十几秒；可
  考虑服务端并发 fetch 或结果短 TTL 缓存。非本批范围，待拍板。**边界（reviewer 提出）**：
  服务端无总超时（仅每请求 20s abort），repo 很多时最坏可能超过客户端 320s guard——guard
  先 reject、任务继续跑、重试 join 同一任务（自愈），体感是重复报错；届时一并治（服务端
  总超时或并发拉取）。
- StatusDot/StatusMarker（shell-primitives）休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
