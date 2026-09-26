# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-27（**§6.12p 第三轮真机反馈修复 `1c50d91`**：三轮「拖不动」真根因 = MobileSheet 交互 effect 在 Radix Portal Content 挂载前跑、ref=null 提前 return 且永不重绑——第二轮 preventDefault 从未生效。修复 = state ref callback 传 DOM 就绪信号 + 拖拽驱动迁原生 touch events。**下一步：交用户真机复验（清单见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

§6.12p 三轮真机反馈修复（`0f3c882` + `52af7aa` + `1c50d91`）：①dismiss 不回弹（exit 起点=inline transform）；②holder 移出 sheet 子树；③**绑定时机 bug**（Radix Portal Content 晚于宿主 useEffect → 永不重绑，preventDefault 曾空转）——state ref callback 修复 + touch events 直驱。探针 54/54、四门禁 + e2e 24/24 全绿。

## 本 session 焦点

1. 第三轮用户反馈「抓 sheet 头部小横线完全拖不动」→ 系统诊断（CDP getEventListeners + 合成 dispatch + window 打点三重对照）实锤 **listener 挂上了但 effect 从未执行到绑定代码**——`contentRef.current` 在 effect 跑时为 null。
2. 真根因：**Radix Portal 的 Content DOM 挂载晚于 MobileSheet 的 useEffect**（open=true 的 commit 时 ref 未赋值），effect `[open]` 提前 return 后再无 open 变化 = 永不重绑。第二轮 preventDefault 修复（`52af7aa`）因此**从未生效**——探针全绿测的是 React 合成 pointer 路径，原生 listener 空转，这正是「探针全绿真机失败」两轮的原因。
3. 修复：**state ref callback**（`ref={setContentNode}`，effect 依赖 `[contentNode]`，React 官方模式）+ **拖拽驱动从 pointer events 迁原生 touch events 直驱**（iOS pointer 是 touch 派生兼容层不可控；touch events + non-passive touchmove preventDefault 是 touch-action 出现前 iOS 自定义手势唯一可靠通道）。
4. 探针修正：t0/t1 采样加 `isConnected` 守卫（exit 卸载瞬间 detached handle rect 返回 0 不抛错，误报 fail）。

## 关键决策（本阶段不可丢）

- **Radix Portal DOM 就绪铁律（新，已记 frontend-notes §14）**：需要挂 DOM 的副作用，就绪信号用 state ref callback（`useState` + `ref={setNode}`，effect 依赖 `[node]`）；`useRef` + effect 内 `if (!ref.current) return` 且依赖无 DOM 信号 = 潜在永不生效。诊断法：CDP `Runtime.evaluate` + `getEventListeners(el)` 直接列已注册 listener 对质。
- **iOS 拖拽手势通道**：原生 touch events 直驱 + non-passive touchmove preventDefault（整个手势期非 idle）；touchstart 不 prevent（保 tap click）；touchcancel 视同松手；touch target 固定无需 capture；pointer events 不用于拖拽驱动（iOS 派生层不可控，Chromium 模拟不出）。
- **嵌套浮层铁律**：holder 模式浮层承载主操作流时必须在 MobileSheet/DialogContent 子树外（Fragment 兄弟位）。
- **拖拽 dismiss 动画范式**：exit keyframes 无 from → inline transform 即动画起点；滑出形态 inline 变量覆盖（--tw-exit-translate-y/--tw-exit-opacity/--tw-animation-duration/--tw-ease）。
- **dismiss 阈值**：≥96px 或 24-96px+速度 ≥0.5px/ms；<24px slop 不接管；DRAG_START_PX=6。
- **探针诊断方法论**：「listener 存在但函数体不执行」→ 用 getEventListeners + 绑定时刻 window 标记 + 元素身份对比（`window.__bound === querySelector` 结果）三步定位；console 打点有 Playwright 异步送达时序，window 计数器同步可靠。
- 基线对照法（worktree 43099）/ stdout 缓冲 / Edit 注入防护 沿用。

## 进度（已完成 / 进行中 / 待办）

- ✅ §6.12o 加载态 + §6.12n sheet 收敛 + §6.12p 三轮反馈修复（`0f3c882`+`52af7aa`+`1c50d91`）
- ✅ 验证 = 四门禁 + CSS 硬闸 + token 机检 + e2e 24/24 + 单测 673 + 探针 m5-sheets 54/54（含 CDP touch 跟手逐步断言）
- ✅ 记档：redesign-v2.md §6.12p-③ + frontend-notes §14
- ⬜ **交用户真机复验（清单见下）——重点：三轮以来首次「listener 真正绑上」的版本**
- ⬜ 若真机仍拖不动 → 备选：无标题菜单 sheet 热区增高（grab 40×5 + 12px 行，需拍板视觉代价）/ 拖拽热区扩展到内容区非滚动带
- ⬜ 记档不修：runtime-config confirm 从属嵌套；§6.12o 3 项
- ⬜ 存量欠账：rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（§6.12p 三轮）

1. **拖拽手感（重点）**：抓 sheet 头部小横线/标题栏下滑——**应能拖动且全程跟手**（前三轮「拖不动」的根因已修，本轮 listener 实际生效）
2. 松手（>96px 或快速甩）→ 从松手位置滑出屏幕不回弹；轻拖回弹原位
3. 热区按钮 tap 不受影响：审批「全部允许」、菜单项、行按钮点击正常
4. sheet 内列表滚动正常（历史列表等超高内容）
5. 历史 sheet closed 行 → 命名 prompt 稳定可见，确认后 resume
6. 同一 sheet 反复开关下拉行为一致；双主题一致
7. §6.12o 加载态 11 项 + §6.12n 浮层清单（前轮遗留待验）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；`1c50d91` 已 rebuild（CSS 硬闸过，dist 06:52）。
- 风险提示：touch events 直驱后 Chromium 桌面（无 touch）窄窗下拖拽不可用——MobileSheet 仅移动端渲染（useIsMobile 分流），桌面不受影响；探针 CDP touch 已验证 touch 路径。

## 易丢的关键上下文

- **探针跑法**：touch main.tsx + sleep 16 + 核对 dist mtime + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **诊断技巧**：/tmp 脚本解析到全局 playwright 无浏览器 → 挪进 scripts/ 跑完删；python patch 前先确认锚点字符串原样存在（replace 静默不命中会引入 ReferenceError）；CDP `getEventListeners` 需 `includeCommandLineAPI: true`。
- **Playwright**：detached 元素 `getBoundingClientRect()` 返回 0 不抛错——几何采样加 `isConnected` 守卫；双 sheet 共存窗口等目标标题；CDP touch 派生 pointer。
- route mock LIFO / preview 带 mtimeMs / 右栏 InitScript 沿用。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-27 06:52；触发原因：§6.12p 第三轮反馈修复 commit `1c50d91` + handoff save
