# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-13（**第三轮返工（sash 无缝）全部完成待 commit；用户三条桌面三栏反馈已记 inbox，下一步 plan**）

## 一句话状态

sash 返工批完成：gap=0 紧贴 + 10px 透明命中区（把手压交界线）+ 双 reviewer 消化（row 方向常显 1px 线补横线 / 拖动态 pointer-events-none 豁免 / maximized 不渲染 gutters）→ 全套验证绿（单测 795 / probe 18/18 + 14/14 / CSS 硬闸 / tokens）+ redesign-v2 记档；把手居中已被用户真机确认。接下来：commit sash 批 → 三栏批次（左栏折叠 / 右栏折叠钮挪左 / 交界双线收敛）进 plan。

## 本 session 焦点

### 关键决策（不可丢）

- **sash 语义拍板（已实现）**：窗格间不该有缝（VS Code 式一根线 + 把手压线上）。SPLIT_GAP_RATIO=0 + SplitGutter 10px 命中区（SPLIT_SASH_HIT_PX）+ 交界线视觉 col=壳层 border-r / row=sash 常显 1px bg-neutral-line（方向不对称是本质：壳层只有 border-r）。
- **reviewer 同根因归并**：gutter「不该接事件的时机仍接事件」= 拖动态（pointer-events-none 豁免）+ maximized（不渲染）两处时机过滤，均已修。
- **三条桌面三栏反馈（下一批，已记 inbox）**：①左栏桌面可折叠（参照右栏 atom+轨道+RailButton 机制，RailButton 已有 side="left" 分支）；②右栏折叠钮（glabel2 行内「»」，right-panel-tabs :18-26）从右端挪到左端，与左栏折叠钮（左栏右缘）对称；③右栏↔中栏交界双线 = 中栏最右 panel `border-r border-neutral-line` + 右栏 aside `border-l border-neutral-line/80`（workbench-shell :146）叠加 2px，左栏↔中栏只有 side border-r 一条正常——修法候选 = 删 aside border-l（让 panel border-r 承担，与左栏形制对称）。
- **探针教训**：上批 17/17 全绿但修错语义——真机模糊表述先对齐期望形态/参照系再修。从 /tmp 跑探针会解析错 playwright 缓存，脚本放 repo scripts/ 下跑。

### 进度

- ✅ sash 批 4 文件 + reviewer 消化 5 处修复 + 全套验证绿 + redesign-v2.md 返工小节记档（含 reviewer 消化段）+ inbox（三栏反馈 + 五联修挂起项）+ handoff 本档
- ⏳ commit sash 批 → 三栏批次 plan（用户已提，进 plan mode 对齐方案）

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **sash 批真机清单（commit 后交）**：①两/三窗格紧贴无缝（交界处仅 1px 线），把手压交界线正中；②上下分屏交界横线在场且把手压线；③拖拽/悬停反馈正常；④命中区覆盖窗格边缘 5px（sash 固有取舍）——真机确认滚动条/文本选择可接受；⑤PWA 强刷。
- 用户已确认：把手居中（172f146）「非常棒」。
- 三栏批次调研已就位：workbench-shell.tsx 结构（:131 左栏 aside 恒驻 / :133 中栏 section + RailButton / :144-167 右栏 aside + ColumnResizeGutter / :186 RailButton 双 side 分支 / :223 GUTTER_KEYBOARD_STEP_REM）；atom 形制 = atomWithLocalOnlyStorage（workbench-model.ts :170 右栏宽度先例、:315 workbenchPanelOpenAtom = atom(false)）；左栏内容 = WorkbenchSide（项目组 + seg4 + 实例组 + footnav）；右栏折叠入口 = glabel2 行内 clps「»」。
- vite watch 漏 CSS：改 web 包后 touch web/src/main.tsx + `node scripts/ar-verify-css.mjs`；探针 `systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-13 12:40；触发原因：sash 批收尾 + 三栏批次待 plan
