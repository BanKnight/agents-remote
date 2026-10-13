# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-13（**真机反馈第三轮（多分屏 gutter 缝隙）实施+验证+review 完成，待 commit 后交真机清单**）

## 一句话状态

多分屏 gutter 修复完成：诊断实锤「缝占位（SPLIT_GAP_RATIO×中栏宽 4.77px）与固定 4px 视觉条脱节」→ 透明缝（用户「奇怪边距」）+ 把手偏离缝中心（用户「把手不居中」）同根因双症状；修 = SplitGutter 视觉条铺满占位缝（pct(rect)）；probe-desktop-layout **17/17**（新缝中心断言 Δ=0.01px）+ 回归全绿 + reviewer 4 P2 全消化；收尾 commit 中。

## 本 session 焦点

### 关键决策（不可丢）

- **同根因双症状**：①把手不居中 = grip 在 4px 条内居中完好，但**条贴缝左缘**偏离缝中心；②奇怪边距 = 缝占位 4.77px 中右侧 0.77px 透明段露 workspace 异色底。「又出现了」的真相 = 上批修胶囊内居中（字体 fallback）、本批修 gutter 条在缝内居中——不同层症状相似。
- **修法 = 视觉条铺满占位缝**（`pct(rect.w/h)` 替代固定 4px，col/row 分支合并单对象）：透明缝消失 / grip 居中恒等于缝中心 / 拖拽 ratio 零影响 / 嵌套窄缝不溢出压面板 / 拖拽命中区 = 全缝。SPLIT_GAP_RATIO 数值不动（缝宽随视口 4.8-7px 缩放是归一化语义自然结果，观感反馈后再调）。
- **review 实锤无回归面**：children rect 与 gutter rect 互斥（cursor 分配），视觉条加宽只覆盖原透明段（无交互盲区），DropZoneOverlay 行为零变化。

### 进度

- ✅ 诊断（一次性脚本已删，数据记档）：3-group 线性实测 gap=4.77px / gutter 条 4px 贴左 / grip 在条内 Δ=0 / 缝中心偏差 0.39px
- ✅ 修复：instance-area.tsx SplitGutter style / flatten-layout.ts 注释校准（col=宽 row=高）/ probe-desktop-layout Part 4 新增缝中心断言
- ✅ code-reviewer：无 P0/P1，4 P2 全修（注释精度×2 / 探针 filter 简化 + row guard）
- ✅ 验证：typecheck/format/lint/CSS 硬闸/tokens 全绿；probe-desktop-layout **17/17** / probe-grid-panel **14/14** / web 单测 **795**
- ✅ redesign-v2.md 记档（第三轮小节）+ inbox 更新 + handoff 滚动
- ⏳ commit → 真机清单 2 条交用户

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **真机清单 2 条（待交）**：①多分屏任意两条缝均匀（无透明深色段），把手胶囊在缝正中；②桌面左右栏边缝视觉不变。
- **五联修（9ce7830）已验收通过**；写路径 NOT_CHANGED 捕获在 inbox。
- vite watch 漏 CSS：改 web 包后 touch web/src/main.tsx 重建 + `node scripts/ar-verify-css.mjs`；探针用 `systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`。
- 本批工作区路径：instance-area.tsx / flatten-layout.ts / probe-desktop-layout.mjs / redesign-v2.md / inbox.md / handoff。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-13 03:20；触发原因：第三轮缝隙修复收尾记档，commit 前检查点
