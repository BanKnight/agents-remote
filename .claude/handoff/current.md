# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-29（**第二批真机反馈四条修复 commit `5c8f831`**：全局文件页整页整改 + 插件切换项目浮层 + 蓝「'」根因（plus 伪元素冲突）+ crumb 结构性修复 + 桌面右栏 7 项差距。同构整改：同一 DOM + 分档（`[data-desktop-inspector]` + `@media lg`），无两套 DOM。10 探针回归全绿 + 四门禁 + CSS 硬闸。**下一步：交用户真机复验（清单见下，含 PWA 清缓存提醒），随后存量欠账**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第二批真机反馈四条修复已 commit（`5c8f831`，18 文件），10 探针回归全绿 + 四门禁（test 865+9+674）+ CSS 硬闸（183066 字节 text/css）+ tokens strict 0 违例；记档 redesign-v2.md §6.13「真机反馈修复·第二批」段（4 条反馈 + Agent C/D 结论 + diverge 清单）。

## 本 session 焦点（第二批真机反馈收口）

1. **反馈①（全局文件页整页不对）**：双重缩进根因 = `.gfcard` margin 16 + FilesPanel 容器 px-3 → 44px。修 = file-browser 容器 className 模板化（globalCard 时 px 归零）；scopeSeg/搜索容器 `px-4 lg:px-5`；桌面分组建群标签（groupProjectRoots/groupRootFiles，hidden lg:block）；第二卡 inline style 改 utility（会盖 lg 分档）。
2. **反馈②（插件切换项目浮层）**：mobile-plugins-home 项目作用域浮层从会话列表语义改回项目列表（projectOnly 门控）。
3. **反馈③（蓝「'」+ 添加按钮 + 地址栏）**：① plus 伪元素冲突——`.plus::before/::after` 笔画被 utilities 层 `after:-inset-2` 打散 → **容器式热区**范式（外层 button h-7 w-7 + 内层 span.plus，workbench-side 两处；项目组头 `ml-auto` 补相邻选择器断链）。② crumb 分隔符结构性 bug——旧 `button:not(:last-child)::after` 因搜索钮占 last-child 首段无分隔 + 末段反多「/」；修 = `.crumb > * + *::before` + 段按钮在前 `<b>` 收尾 + 搜索钮独立 `.obtn.srch` chip（03o 单源 L139-143）。
4. **反馈④（桌面右栏差距大 + 同构质疑）**：10 项差距修 7——clps「»」折叠钮（PanelHeader 退役）、usePanelToolChip 装配单源（移动/桌面共用 crumb/gitchip/wsearch 四分支，git diff 同 key 缓存共享）、`.gacts` Git 操作行（04d/05i 一致原型）、行密度/左缘 14/cap/Wiki wsearch 分档。diverge 记档 3 项（栏宽 352/＋28px 热区/diff L3 位置）。

## 关键决策（本阶段不可丢）

- **同构整改前提（用户 mid-turn 拍板）**：整改不得「两套 DOM」——**同一 DOM + 分档**：右栏语境 `[data-desktop-inspector]` 属性选择器，main 整页 `@media (min-width:1024px)`；行为收敛共享组件（usePanelToolChip）单份实现，两端只容器不同。
- **容器式热区范式**：CSS 伪元素笔画图标（.plus 类）与 Tailwind after:* utilities 冲突（utilities 层反超）——外层 button 承担热区、内层 span.plus 只画笔画；相邻选择器（`.ghead .tt + .plus`）会被中间 button 断链，需 `ml-auto` 补偿。
- **探针基线失败判定法**：git stash push → rebuild → 对照 → pop 后**必须再 rebuild**（否则诊断跑旧 dist——「滚动容器未找到」假阳性教训）。
- **Agent C plus 实锤**：侧边栏 plus 渲染 DOM 几何完全符合单源（18×18 灰）——用户所见「错误」最可能是 PWA 旧缓存 CSS + 18px 无热区难点按；复验须清缓存。
- 批8 遗留决策继续有效；subagent 按依赖并发（memory `parallel-subagents-by-dependency.md`）。

## 进度（已完成 / 进行中 / 待办）

- ✅ v1.4 对标 9 批全部 commit（批1 `62cb980` … 批9 `98328ca`）+ 第一批真机反馈 `aa95081` + 全套 e2e 26/26
- ✅ 第二批真机反馈四条修复 commit `5c8f831`：10 探针全绿（m9-d 64/0 含 F12b clps、m6-plugins 87/0、m4-tools-l3 65/0、m9-b 19/0、mobile-project-header 25/0、mobile-workbench-states 22/0、mobile-projects-home 21/0、loading-states 13/0、m11-mobile-nav 14/0、files-tree-bugs 与基线一致）+ 四门禁 + CSS 硬闸 + tokens strict
- ⬜ **交用户真机复验**（清单见下；全程多批次累积清单）
- ⬜ 存量欠账：桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验（§6.12p）；`.tree`/`.growrow` 死代码清扫；Agent B 零消费死代码族清扫批次；probe-m10-feedback-fixes H 段基线失败 + files-tree-bugs「05e 五项序」大小写排查；右栏栏宽 352 vs 320 立项；diff 展示位置架构项

## 用户真机复验清单

**⚠️ 先清 PWA 缓存**（侧边栏 plus 上轮实锤渲染正常，旧缓存 CSS 可能钉住旧样式；iOS：删 PWA 重装或 Safari 清网站数据）。

**本轮（第二批，`5c8f831`）**：
1. **全局文件页**（iPhone + 桌面双端）：卡片边距与搜索框对齐（16px 一致）；搜索框不再超右边；地址栏 = crumb 段间「/」分隔、当前段加粗收尾、右端方形搜索 chip（蓝 tint 圆角方钮）；桌面档出现「项目根目录 / 根目录散文件」建群标签、卡片 margin 归零
2. **插件页**：右上切换浮层 = 项目列表（非会话）
3. **工作台侧边栏**：组头「＋」= 灰色笔画 + 隐形 28px 方热区（好按）；文件/Git 标签地址栏 = crumb 新结构；**任何地方不再有蓝色小撇「'」**
4. **桌面右栏**：头「检视 · 只读」行内右端「»」可收起；Files 标签顶部有地址栏+搜索；Git 标签 = 三等宽方按钮行（历史列表/提交…/分支）；行密度变紧、左缘 14px 统一；Wiki 有搜索框

**前批累积（`aa95081` + 批6-9，详见 snapshots/20260929-0216.md）**：终端 header 两行、侧边栏图标 20px、全局文件页 .sfield/.gfile、插件页段序/停用闭环、预览 sandbox、滚动收敛迷你条、托盘两段确认、活动卡橙点。

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；`5c8f831` 后已 rebuild（CSS 硬闸过，183066 字节 text/css；stylesheet content-type 实测 text/css）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **Agent D 桌面右栏 10 项差距清单**已消化记档 §6.13 第二批段；**Agent B 死代码清单**在 task output（a9ce64120b822bd82），清扫批次直接取用勿重扫。
- `.obtn`/`.gacts`/`.sfield`/`[data-desktop-inspector]` 分档段均在 v2-primitives.css 新增段，注释含单源行号锚点。
- 本 session 生成损坏高发（前段 ~6 次 Edit 混入垃圾）——对策照旧：小段 Edit、失败即 Read、不硬试第三次；文件编辑只用内置工具。
- 真机反馈段记档位置：§6.13 内「真机反馈修复·第二批」（「基线失败记档」段后、§7 前）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-29；触发原因：第二批真机反馈四条修复 commit `5c8f831` + /handoff save
