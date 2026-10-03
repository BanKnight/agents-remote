# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-04（**弹层 enter 近瞬时档 + sheet enter motion 化收口 `f5e1436`**：用户拍板「保留弹簧曲线只大幅提速」→ 三档 spring 时长 token 收敛 120ms / exit 150ms 不动；mobile-sheet enter 从 CSS 类串换 motion 弹簧（时长读 token = JS/CSS 单源）；**sheet-debug.ts 已删**（真机复验已过 + 完成使命）；调试实锤 motion `stop()`「最后一写」机制（stop 时已在 rAF 队列的回调仍执行一次覆盖接管写入 → 同帧 rAF 矫正）+ base=frozenY 语义修正；reduced-motion JS 兜底补齐三处（design reviewer P2）。probe-mobile-motion **45** + probe-spring-overlays **19** 全绿，全门禁绿，双 reviewer 消化完毕，已 push。**待真机复验：弹层打开近瞬时统一手感 + sheet 拖拽回归项**。回滚点 = `938618a`。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

**弹层动效近瞬时档落地（`f5e1436`）**：三档 spring 时长 token 收敛 120ms（`--spring-standard/-snappy/-sheet-duration`，分档结构保留备差异化），弹层打开观感「瞬时就出来了」；`--duration-exit: 150ms` 与 scrim fade 不动（关闭快速离开语义不变）。mobile-sheet enter 换 motion 弹簧驱动收口（Part 2 弹层族换 motion **取消**——静态打开无中断场景，CSS 提速即达）；`sheet-debug.ts` 删除。决策详见 redesign-v2.md 动效段「弹层 enter 近瞬时档 + sheet enter motion 化收口（2026-10-04）」小节。

## 本 session 焦点（弹层提速 + motion 化收口）

1. 用户两指令：「调试用的浮层可以干掉了」（sheet-debug 删除）+「弹出浮层还是不要加动效了，显得好慢」→ 三轮对齐拍板**近瞬时 ~120ms**（保留曲线只缩时间轴；「真·瞬时」与「保留动效」两答案矛盾后用户确认近瞬时档）。
2. **Part 2 取消**：原计划弹层族 Dialog/Popover/Dropdown 也换 motion 可中断 spring——静态打开无中断场景，120ms 下 motion/CSS 无感差异，CSS token 提速即达。
3. **mobile-sheet enter motion 化收口**：CSS enter 类串删除，`useLayoutEffect` + `animate(el, {y:[y0,0]}, spring bounce 0.12)`，时长读 token `--spring-sheet-duration`（JS/CSS 单源，页内 `setProperty` 放慢 = 探针 fixture）；§21 WebKit 重建防线随 motion 驱动退役（rAF 驱动无样式匹配重建面）；`enterKilled` state / `getAnimations()` cancel 兜底删除。
4. **探针 3 fail 调试破案**（本轮最大产出）：①`base = frozenY - dy` 增量语义被探针否证（播完后接管丢起步位移，22.5 ≠ 30）→ **base = frozenY**（动画偏移 + 手指全量位移，与 CSS 时代 base+dy 一致）；②**motion `stop()`「最后一写」**——stop 时已在 rAF 队列的回调仍执行一次，把接管写入覆盖回 motion 轨迹值（倒退 ~14px，trail 逐帧实抓）→ 接管后注册**同帧 rAF 矫正写入**（注册序晚于 motion 已排队回调 → paint 前最后写入生效，零跳变）。frontend-notes **§25** 新条。
5. 双 reviewer 消化：design P2-1 reduced-motion JS 兜底缺口（motion rAF 三处 enter/回弹/带速滑出补 `prefersReducedMotion()` 分支）+ 3 处注释失实；code P2 探针 rise[0] 采样时序（采样器挪 click 前）+ 3 处 P3（visualDragY 一致性 / sentinel 魔数 / 双份注释）。

## 关键决策（本阶段不可丢）

- **近瞬时档拍板（2026-10-04）**：三 token 收敛 120ms、保留分档结构（消费点零改动、未来差异化仍有分档）；`frozenY` 直取（base = motion stop 冻结的 inline 偏移），`frozenY - dy` 增量语义**否证勿再走**。
- **motion stop「最后一写」（frontend-notes §25）**：motion 13.4.4 的 `controls.stop()` 同步置标志但**阻止不了已在 rAF 队列中的回调**——该回调仍写一次 inline。接管/中断 motion 动画后必须在**同帧注册 rAF 矫正写入**（注册序在后 → paint 前最后写入生效）；执行条件 = phase 仍是 dragging 且无回弹/exit controls。探针 waitStillTop「1 帧静止」可能是慢速尾段误判（帧差 <0.5 ≠ 速度 0），必须配**硬数值断言兜底**（visShift ±0.5）。
- **探针 fixture 方案换代**：WAAPI 定格（getAnimations/pause）对 motion rAF 动画拿不到实例 → 页内放慢 `--spring-sheet-duration`（1600ms）+ 跨起步阈值接管即定格；slowEnter/restoreEnter 成对（防污染后续段）。
- **reduced-motion JS 兜底三处**（design reviewer P2-1）：CSS 站点级兜底只压 animation/transition，管不到 motion rAF——enter（置终态）/ springBack（清 inline）/ dismiss 滑出（直达 onOpenChange(false)，exit CSS 已被压瞬时）各自启动前查 `prefersReducedMotion()`。
- **sheet-debug.ts 已删**：真机复验通过 + 证据纪律完成使命；§22 取证方法论沉淀保留。
- 历史拍板继续有效：motion 库仅命令式 animate 消费（entry 与摘除基线持平）；拖拽判定/测速层在本文件；「用户的测试操作不是变量」；页面切换动效不做。

## 进度（已完成 / 进行中 / 待办）

- ✅ sheet 手感全链收口（`e1ae5a6`→`f1f99ed`→`7c590b6`→`e7fb156`+`65fa654`→`7e9db59`→`a98e13b`→`c8bdbfc`，probe 48 + 单测 13 全绿，真机复验**已过**）
- ✅ **弹层 enter 近瞬时档 + sheet enter motion 化收口（`f5e1436`，已 push）**：token 收敛 120ms + motion 化 + sheet-debug 删除 + 探针 fixture 换代 + motion stop 最后一写修复 + 双 reviewer 消化；probe-mobile-motion **45** + probe-spring-overlays **19** 全绿；全门禁 + CSS 硬闸（188771 字节 text/css）+ tokens 机检 0 违例；记档 redesign-v2.md 动效段小节 + frontend-notes §25
- ⬜ **交用户真机复验（当前最优先，清单见下）**
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（本批，iPhone 优先）

**弹层打开近瞬时（核心项，2026-10-04 拍板验收）**：
1. **弹层打开统一手感**：新建会话菜单 / prompt Dialog / 设置弹层 / ⋯ 操作菜单 sheet / 移动 sheet 升起 → 全部**近瞬时出现**（~120ms，观感「瞬时就出来了」，保留轻微弹性收尾）；连续快速开合不卡不跳
2. **关闭仍快速离开**：Esc/scrim/取消关闭 → 150ms 快速离开（未提速未减速）
3. **列表入场/按压/右栏**：清单 23–25 项回归无变化（stagger 28ms 递增、行 0.98/按钮 0.97、右栏 280ms 未动）

**sheet 拖拽回归项**（motion 化收口后重点）：
4. **打开即下拉**：sheet 打开后**不用抢时间**，按住任意位置（含内容区/菜单项）往下拖 → 立刻跟手无跳变（升起中被接管 + 播完后接管两路径）
5. **回弹手感**：快甩带速下冲过冲 / 慢拖平滑收回 / 慢拖过 sheet 高度 ~1/4 即收起（投影判定）；回弹途中可再抓住
6. **历史/文件列表 sheet**：列表原生滚动不受影响（窄热区保护）
7. **reduced-motion**（若方便验）：系统减弱动效开启 → sheet 打开/回弹/收起全部瞬时到位，无弹簧动画

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（188771 字节，content-type text/css）；commit `f5e1436` 已 push。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量时序 flake（与本批无关）：`probe-claude-reconnect-delta` ③c 偶发，复跑即绿。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **motion stop 最后一写**（§25）：改 mobile-sheet 接管/中断逻辑时，任何「stop 后写 inline」都要配同帧 rAF 矫正；探针侧静止判定配 ±0.5 硬断言。
- **探针 fixture**：页内 `documentElement.style.setProperty("--spring-sheet-duration","1600ms")` 放慢 enter 作确定性窗口，用后 removeProperty 恢复；slowEnter/restoreEnter 在 probe-mobile-motion + probe-spring-overlays 两处成对出现。
- **waitStillTop 语义**：返回 null = sheet 消失（close 竞态），调用侧 throw 无效化本轮；frames<30 断言 + visShift ±0.5 兜底双层。
- **弹层 token 三档**：值同 120ms 但结构独立（standard=dialog / snappy=popover+dropdown / sheet=motion JS 读）；改时长只动 index.css 一处。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁。
- 记档位置：redesign-v2.md 动效段「弹层 enter 近瞬时档 + sheet enter motion 化收口（2026-10-04）」小节 + frontend-notes §25；历史动效决策见同文件动效段全线。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-04；触发原因：弹层近瞬时档 + motion 化收口 commit `f5e1436` 已 push，交真机复验
