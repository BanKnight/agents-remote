# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-11（**真机反馈第二轮收尾提交 `936b1ed`，验证链九项全绿，待交重写版真机清单**）

## 一句话状态

第二轮真机反馈全部收尾并提交：⑤ 键位自定义完整落地（QuickKeysEditor：8 键显隐 + 拖拽/键盘排序，applyQuickKeyOrder 单管道）、7a/7b 编辑动线反转（渲染态纯阅读；.emeta 合并行、.aux 退役）、2' 骨架壳 min-w-0、⑥ 边距统筹收口、标尺文档口径同步（design_spec §4.5 + components.css）、keyboard-debug.ts 退役（tokens 机检零违例硬闸态）。**下一步 = 重写版真机清单交用户复验**（清单见下「易丢的关键上下文」，按「从哪进、做什么动作、应该看到什么」格式）。

## 本 session 焦点

### 关键决策（不可丢）

- **QuickKeysEditor**（web/src/components/workbench/quick-keys-editor.tsx）：props 全受控（hiddenIds/keys/onOpenChange/onReorder/onToggleHidden/open/order），配置逻辑归调用方 SessionDetailRoute——照 SessionInputDrawer slot 模式。拖拽 = pointer events + **down 即 setPointerCapture**（grip 专用手柄无点击动作，无需 MobileSheet 6px 起步阈值——§23 pending 失联结构性消失）+ 列表容器 non-passive touchmove preventDefault + 列表 DOM 序恒定行 transform 补位 + 松手 setOrder 与清 transform 同批单次 commit。键盘等价通道：行聚焦 ↑/↓ 换位。
- **terminalQuickKeysOrderAtom**（workbench-model.ts，localStorage "workbench.terminalQuickKeysOrder"）+ `applyQuickKeyOrder` 纯函数：已知键按存储序排前、缺失尾补、稳定排序、多余 id 忽略——快捷键条渲染与编辑面板共用单一管道；order 与 hidden 正交（顺序含被隐藏键）。
- **7a/7b 反转口径**（标尺文档已同步 design_spec §4.5 四条 + components.css .fmeta 头注）：md/html **渲染态 = 纯阅读，点正文不进编辑**；编辑动线 = segc 切「源码」后点正文。编辑态行 = `.emeta`（工具钮组撤销/重做/收键盘 + dirty + fact 放弃/完成）；底部 `.aux` 退役上移（编辑器全高）；push 容器（nav 模式）[放弃][完成] 保持在导航右。
- **z-index 机制记档（design review Chromium 实证）**：transform 建立的 stacking context 不扩展 z-index 适用范围——li 必须 `relative` 才能让拖拽行 `z-1` 提升绘制序。
- **keyboard-debug.ts 已删除**（批 18 取证收口）：tokens 机检唯一豁免消失，机检从此零违例硬闸态。
- **review 记档不做**：CenteredDialogCard 提取（13 份拷贝家族，超 surgical 范围）；桌面 20px 内容线三机制统一（数值自洽、机制分立）。

### 进度

- ✅ 第一轮 6+1 条：`8114ae9`（代码）+ `c6b1047`（记档）。
- ✅ 第二轮收尾：`936b1ed`（32 文件，+942/−378）——QuickKeysEditor 三件套 + 7a/7b + 标尺同步 + review 消化全项。
- ✅ 验证链九项：format/lint/typecheck 0w + CSS 硬闸 + tokens 0 违例 + 单测 778 + 探针 quick-keys-editor 19/19 / keyboard-inset 10/10 + e2e file-browser 2 / terminal-session 1 / mobile-nav 6。
- ✅ redesign-v2.md §6.12o 段尾「2026-10-11 真机反馈第二轮」记档完成。
- ⬜ **重写版真机清单交用户**（下一动作，清单见下）。
- ⬜ 用户真机复验后按反馈迭代。

### 阻塞 / 风险

- 无阻塞。html 渲染态 onFocus 通路（第一轮⑦）已随 7a 反转降级——渲染态本就不进编辑，该通路只剩「iframe 聚焦即切源码」的辅助语义，真机验证优先级降低。

## 易丢的关键上下文

- **重写版真机清单（待交用户，iPhone PWA 实际导航）**：
  1. **键位编辑面板（新）**：任一终端会话 → 点输入条左「⌃」展开输入抽屉 → 控制行右端 ⚙ → 弹出「自定义快捷键」面板（移动 = 半屏 sheet，桌面 = 居中弹窗）→ 8 行键位：拖右侧手柄上下移 = 排序、点行 = 显隐开关 → 关面板 → 输入条上方快捷键条按新顺序渲染、被关的键消失 → 杀掉 PWA 重开，顺序与显隐保持。
  2. **渲染态不误触编辑（7a）**：工作台开任一 .md 文件标签（渲染态）→ 点正文任意处 → **不应**进入编辑；点右上「源码」分段切到源码 → 再点正文 → 进入编辑。
  3. **编辑态工具条上移（7b）**：接上，编辑态看正文上方一行 = 撤销/重做/收键盘（移动）+ 右侧「放弃/完成」；**底部没有工具条了**，编辑器到屏幕底；弹键盘后工具条不被遮挡。
  4. **加载骨架**：进任一项目工作台，agent 区骨架应撑满整区不偏移；骨架→内容切换无横向跳动。
  5. **边距**：设置页/插件页/全局文件页桌面宽度下，内容统一距左 20px。
- tmp/ 已入 .gitignore（真机截图 tmp/IMG_7279.png 不会被误入库）。
- 设置二级换代真机清单 5 条（任务 A 交付）仍待用户复验。
- agent-browser CLI 可用（iPhone 16 设备模拟），一次性 UI 验证优先用它。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-11 09:05；触发原因：第二轮反馈收尾提交 `936b1ed` + 记档 + handoff save
