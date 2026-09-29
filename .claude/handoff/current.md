# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-29（**第三批真机反馈三条修复 commit `a4e9e69`**：全局文件页卡片双重边距归零 + 检视面板三基础标签（文件/Git/Wiki）常驻 + 搜索框归一 .psearch（.sfield 页私 30px 退役）。几何探针实锤对齐 + 7 探针回归全绿 + 四门禁 + CSS 硬闸。**下一步：交用户真机复验（清单见下），随后存量欠账**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第三批真机反馈三条修复已 commit（`a4e9e69`，11 文件）：卡片边距对齐（16px 实锤）+ 检视面板三基础标签常驻 + 搜索框与其他页面归一（.psearch 38px）；几何探针 + m4 65/0 + m9-d 64/0 + m9-b 19/0 + states 22/0 + projects-home 21/0 + m6-plugins 87/0 + 四门禁 + CSS 硬闸 + tokens strict 全过；记档 §6.13 第三批段。

## 本 session 焦点（第三批真机反馈收口）

1. **反馈①（列表边距还是不对）**：双重边距根因 = 搜索容器 `px-4`（16px）+ `.gfcard` 自带 `margin-left:16` 叠加 → 卡左缘 32px vs 搜索框 16px（上一批只归零容器 px，漏了 gfcard 自身 margin 在新嵌套下的叠加）。修 = `.gfcard` margin `14px 16px 0` → `14px 0 0`；复验 h1/搜索框/卡片/cap 左缘全 16px 对齐。
2. **反馈②（检视面板缺 wiki）**：「工作台中的侧边栏」= 用户对检视面板的称呼；03m/03p 原型 ptabs = 文件树/Git/Wiki **三标签全在**，旧实现默认单 files 需手动「＋」开。修 = `BASE_PANEL_TABS` + `withBasePanelTabs` 读侧 normalize（存量 localStorage 单 files 自动补齐），移动/桌面同构同一份；「＋」菜单保留（激活幂等）；✕ 仍仅 file 标签。
3. **反馈③（搜索高度 dilemma 的答案）**：**语境分工**——mainPage 整页语境 = 一级页单源 `.psearch`（38px/r12 与插件页/项目页一致）；工具面板语境（检视面板 files 搜索 `.wsearch` 30px）保持紧凑。同一 input 形态、不同语境不同原语档位，零两套 DOM。`.sfield` 页私 30px 退役（diverge 记档：原型 10-tab 页私值 vs 跨页一致性，用户拍板一致性优先）。

## 关键决策（本阶段不可丢）

- **「侧边栏」指代辨析**：用户在 iPhone 上的「工作台中的侧边栏」= 检视面板（从旁滑入的面板）；桌面 workbench-side 左栏在移动端不存在。第二/三批反馈的「侧边栏」三项全部落在检视面板语境。
- **探针基线纪律**：默认标签 1→3 是预期行为变化，探针断言随之适配（m4/m9-b/m9-d 三处）；「05e 五项序」仍为存量基线失败（大小写不匹配，在案）。
- **同构语境分工范式**（第三批沉淀）：同构 ≠ 同数值——mainPage 语境与工具面板语境允许不同原语档位（.psearch 38 vs .wsearch 30），关键是「同语境跨页一致」+「同一 DOM 形态」。
- 第二批关键决策继续有效：同构整改同一 DOM + 分档、容器式热区范式、stash 对照 pop 后必须 rebuild。

## 进度（已完成 / 进行中 / 待办）

- ✅ v1.4 对标 9 批（批1 `62cb980` … 批9 `98328ca`）+ 第一批反馈 `aa95081` + 第二批反馈 `5c8f831` + 第三批反馈 `a4e9e69` 全部 commit
- ✅ 第三批验证：几何探针（卡片/搜索框 16px 对齐）+ m4 65/0 + m9-d 64/0 + m9-b 19/0 + states 22/0 + projects-home 21/0 + m6-plugins 87/0 + files-tree-bugs（仅存量）+ 四门禁 + CSS 硬闸（182787 字节）+ tokens strict
- ⬜ **交用户真机复验**（清单见下）
- ⬜ 存量欠账（不动）：桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` + Agent B 零消费死代码清扫批次；probe-m10-feedback-fixes H 段基线 + 「05e 五项序」排查；右栏栏宽 352 vs 320；diff L3 位置架构项

## 用户真机复验清单（第三批，`a4e9e69`）

1. **全局文件页**（iPhone）：列表卡片两侧边距 = 16px 与标题/搜索框对齐（之前卡片缩进多 16px）
2. **检视面板**（iPhone 工作台 → ticon 开面板）：打开即见 **文件 / Git / Wiki 三个标签**（不用手动「＋」开）；Git/Wiki 点了直接激活
3. **全局文件页搜索框**：高度 38px 与插件页/项目页一致（之前 30px 偏矮）；灰底胶囊无描边（.psearch 单源形态）
4. 桌面右栏同步：ptabs 三常驻 + /files 搜索框同款 34px 档

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；`a4e9e69` 后已 rebuild（CSS 硬闸 182787 字节 text/css）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- `scripts/diag-files-global-geometry.mjs` = 全局文件页几何诊断（入库，JSON key `sfield` 实际查 .psearch）。
- 「侧边栏」= 检视面板（用户指代）——后续反馈先按此辨析，别再误修桌面 workbench-side。
- 本 session 生成损坏高发（Edit 混入垃圾字符数次）——对策照旧：小段 Edit、失败即 Read、不硬试第三次。
- 记档位置：§6.13「真机反馈修复·第三批」段（:961 起）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-29；触发原因：第三批真机反馈三条修复 commit `a4e9e69` + /handoff save
