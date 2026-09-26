# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-27（**§6.12p 第四轮修复 `5e56d71`**：拖拽驱动回退 pointer events——真机实证 touch 直驱无效、pointer 有效。preventDefault 在绑定修好后第一次真正生效，针对 pointercancel 中断。**下一步：交用户真机复验**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

§6.12p 四轮真机反馈修复（`0f3c882`+`52af7aa`+`1c50d91`+`5e56d71`）：绑定时机 bug（Radix Portal Content 晚于宿主 effect → preventDefault 曾空转）已修；驱动定版 **pointer events + non-passive touchmove preventDefault**（touch 直驱被真机否定勿再走）。探针 54/54、四门禁 + e2e 24/24 全绿。

## 本 session 焦点（四轮反馈的完整事实链）

1. 第一轮「松手回弹再消失」→ `0f3c882` 修 dismiss 清 transform（exit 起点=inline transform）。
2. 第二轮「不跟手/经常拖不动」→ `52af7aa` 加 preventDefault——**因绑定 bug 从未生效**。
3. 第三轮「抓小横线完全拖不动」→ `1c50d91` 诊断出**真根因**：MobileSheet 交互 effect 依赖 `[open]`，但 Radix Portal Content 挂载晚于宿主 useEffect，ref=null 提前 return 且永不重绑——探针全绿测的是 React 合成 pointer 路径（委托，不需要 ref），原生 listener 空转 = 「探针与真机脱节」的根因。修复 = state ref callback（`ref={setContentNode}`，effect 依赖 `[contentNode]`）+ 同 commit 尝试 touch events 直驱。
4. 第四轮「拖动依然毫无动静，之前虽有回弹但至少拖动有效」→ `5e56d71` **推翻 touch 直驱**：真机实证 pointer 驱动有效、touch 直驱无效（机制未定论）。四轮现象统一解释：真机「回弹/不跟手」= **WebKit 滚动抢占 pointercancel 中断拖拽走回弹分支**（非 dismiss 分支 bug），Chromium 探针不复现 cancel 故测不到。

## 关键决策（本阶段不可丢）

- **iOS 拖拽手势定版组合**：pointer events 驱动（startDrag/moveDrag/endDrag + setPointerCapture）+ non-passive touchmove preventDefault（读 dragRef，手势期含 pending 全拦）+ 热区 touch-none CSS 第一道。**勿再走：原生 touch events 直驱（真机完全无效）。**
- **Radix Portal DOM 就绪铁律（frontend-notes §14）**：需要挂 DOM 的副作用用 state ref callback（`useState` + `ref={setNode}`，effect 依赖 `[node]`）；`useRef` + effect 内 `if (!ref.current) return` 且依赖无 DOM 信号 = 潜在永不生效。诊断法：CDP `getEventListeners` + 绑定时刻 window 标记 + 元素身份对比。
- **探针≠真机的边界**：Chromium 不复现 WebKit pointercancel/手势抢占——拖拽手感类问题探针只能验证逻辑通路（跟手/dismiss 几何），手势判定以真机为准；勿据探针全绿推断真机手势行为，也勿据探针推翻真机实证。
- 嵌套浮层铁律 / dismiss 阈值（≥96px 或 24-96px+速度≥0.5px/ms，DRAG_START_PX=6）/ exit 起点范式 沿用 §6.12p 前轮记档。

## 进度（已完成 / 进行中 / 待办）

- ✅ §6.12o 加载态 + §6.12n sheet 收敛 + §6.12p 四轮反馈修复（`0f3c882`+`52af7aa`+`1c50d91`+`5e56d71`）
- ✅ 验证 = 四门禁 + CSS 硬闸 + token 机检 + e2e 24/24 + 单测 673+829+9 + 探针 m5-sheets 54/54
- ✅ 记档：redesign-v2.md §6.12p-①~④ + frontend-notes §14（含勿再走）
- ⬜ **交用户真机复验（清单见下）——本版 = pointer 驱动（用户实证「拖动有效」）+ preventDefault 首次真正生效**
- ⬜ 若真机仍有回弹/不跟手（即 preventDefault 生效后仍被 pointercancel 打断）→ 备选：拖拽热区扩展到内容区非滚动带 / 无标题菜单 sheet 热区增高（需拍板视觉代价）
- ⬜ 记档不修：runtime-config confirm 从属嵌套；§6.12o 3 项
- ⬜ 存量欠账：rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（§6.12p 第四轮）

1. **拖拽手感（重点）**：抓 sheet 头部下滑——应跟手且**中途不再被弹回**（preventDefault 首次生效，对抗 WebKit 滚动抢占）
2. 松手（>96px 或快速甩）→ 从松手位置滑出屏幕不回弹；轻拖回弹原位
3. 热区按钮 tap 不受影响：审批「全部允许」、菜单项、行按钮点击正常
4. sheet 内列表滚动正常（历史列表等超高内容——preventDefault 仅拦拖拽手势期，列表滚动应无影响）
5. 历史 sheet closed 行 → 命名 prompt 稳定可见，确认后 resume
6. 同一 sheet 反复开关下拉行为一致；双主题一致
7. §6.12o 加载态 11 项 + §6.12n 浮层清单（前轮遗留待验）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；`5e56d71` 已 rebuild（CSS 硬闸过，dist 07:45）。
- 风险：若真机仍被 pointercancel 打断（preventDefault 对 WebKit 滚动容器内手势拦不住），下一手是热区结构方案（备选已列）。

## 易丢的关键上下文

- **探针跑法**：touch main.tsx + sleep 16 + 核对 dist mtime + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **诊断技巧**：detached 元素 `getBoundingClientRect()` 返回 0 不抛错（几何采样加 `isConnected` 守卫）；/tmp 脚本解析到全局 playwright → 挪进 scripts/ 跑完删；python patch 前确认锚点原样存在（replace 静默不命中）；window 计数器打点比 console 同步可靠（Playwright console 异步送达）。
- **Playwright**：双 sheet 共存窗口等目标标题；CDP touch 派生 pointer events 可驱动 pointer 手势。
- route mock LIFO / preview 带 mtimeMs / 右栏 InitScript 沿用。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-27 07:45；触发原因：§6.12p 第四轮修复 commit `5e56d71` + handoff save
