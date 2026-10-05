# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-06（**v1.5 换代批 0–4 已 commit + push**：批 0 `d1210f0` / 批 1 `75a88f2` / 批 2 `36b2195` / 批 3 `3ace270` / 批 4 预览矩阵·桌面（hash 见 git log）；下一批 = 批 5 历史规模化）

## 一句话状态

**v1.5 设计包换代 9 批计划推进中（5/9 完成）**：批 4 预览容器矩阵·桌面已实施 + design review（P1×1+P2×4 全消化）+ 记档；检视器收敛三结构标签（渲染层投影，共享 atom 不动）、中栏 file/wikiread 标签（05h4 翻案：file tab 完整预览/编辑）、tabstrip 右端 [pencil][⋯] 跟随激活标签、10m2 全局文件推入态 +「在工作台打开」、桌面补「让 Agent 读这篇」。下一批 = 批 5 历史规模化。

## 本 session 焦点（v1.5 换代 9 批计划）

Plan（已批准）：`/home/deploy/.claude/plans/toasty-sprouting-star.md`。批次 = 0✅ → 1✅ → 2✅ → 3✅ → 4✅ → **5 历史规模化（下一个）** → 6 项目管理 → 7 多端骨架 → 8 微交互收尾（含双路径附件）。

**批 4 已落地**（详情见 redesign-v2.md §6.14 批 4 段）：
- **检视器三结构投影**：`inspectorTabs = panelTabs.filter(files|git|wiki)`——渲染层投影，**共享 atom 不动**（移动保留 file/wikiread）；激活项指向隐藏标签回退 `"files"` 防死屏。
- **中栏 file 标签（05h4 翻案）**：检视器树点文件 → `onOpenFile` → 中栏 `file_<fullPath>` tab（`FileTabPreview`，完整预览/编辑——v2 §6.10-8 只读化被翻案）；`FilesToolTab.onOpenFile`/`WikiToolTab.onOpenPage` 双语境 prop（传入=直达中栏、不传=栏内栈=移动）。
- **tabstrip 右端（05h4）**：file tab 激活 = [pencil][⋯]、session tab = [⋯]；⋯ 跟随激活标签（会话 4 项/文件 3 项）；**编辑态只剩结构钮**；TabChip ℹ 退役（实例信息入口收敛 ⋯，与批 1 移动同构）。
- **wikiread 进中栏**：`wikiread_<projectName>/<slug>` tab（`L3WikiReader` 复用 + .actbtn 桌面补齐）；管道闭环 tab→`navigateToWiki`（URL splat）→focus effect→`ensureTabOpenLeaf` 幂等。
- **10m2 推入态（`FilesPushPreview`）**：`filesPushActive = mainPageActive && !!focusId`；列表点文件 → `/files/file/$`+leftMode sticky **不写 layout**；‹ 返回 navigate `/files`；「在工作台打开」= `openPushInWorkbench`（ensureTabOpenLeaf+navigateWorkbench，大面积切换唯一入口）；focus effect 推入 gate 防误开 tab；编辑受控与中栏 tab 共享 `workbenchFileTabEditingAtom`。
- **reviewer 消化（subagent 恢复产出首份批内报告）**：P1-1 桌面 fmeta/emeta 页私 padding 档（中栏 14/26、推入态 20/20、emeta 推入态 20/26）→ `fdesktop` 容器标记 + `push-preview` scope CSS 覆盖（单源 16/14 不动）+ 探针 3 断言；P2 修 3 项（image 菜单「在工作台打开」恒最末 / desktop `.aux` 38px 无 env / 注释纠偏）。

## 关键决策（本阶段不可丢）

- **9 批流程**（§6.13 v1.4 先例）：每批独立 commit + 全门禁 + CSS 硬闸 + tokens 机检 + 探针 + reviewer + redesign-v2.md §6.14 记档 + push；最后统一交真机复验清单。
- **★ design-reviewer subagent 环境已恢复**：批 4 复审正常产出（此前批 2/3 连续 EOF）。**批 2/3 的 reviewer 复审欠账仍在**——可在批 5 开工前并行补（改动面已稳定，审查不阻塞批 5 实施）。
- **多端同构新范式（批 4）**：同一共享 atom/组件层，「端差异 = 渲染层投影 + 容器 scope CSS」——不动共享状态，两端容器各自 filter/包装；页私规格用容器标记类（`fdesktop`）+ scope 覆盖，单源默认保持 iPhone 档。
- **并发策略（用户 2026-10-06 再强调）**：批次内先规划依赖图——共享契约层（api/shared/model）先行串行，不同页面/端独立文件集派多个 subagent 并发，靠 review+探针收口。批 5 应用：api 先行 → 移动 sheet / 桌面 HistoryList / iPad Sidebar 三面并发。
- **契约缺口沿用**：unsupported/image/too_large 无 `mtimeMs`（批 3 记档），桌面 `.fmeta` 同样省略更新段不伪造——补齐需扩 shared 契约 + api 三处，批 5 api 面可顺带摊牌。
- 历史拍板继续有效：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威。

## 进度（已完成 / 进行中 / 待办）

- ✅ 批 0 `d1210f0` / 批 1 `75a88f2` / 批 2 `36b2195` / 批 3 `3ace270` / 批 4（本 commit，hash 见 git log）
- ⬜ **批 5 历史规模化（下一个）**：api `agent-history` 扩展（filter+段内计数 / search / cursor 游标 20+20 / 五档分组）+ 删除端点；移动历史 sheet 重构；桌面 HistoryList 对齐 + iPad 04g 历史 Sidebar；▾ 菜单「⟲ 恢复历史会话」捷径对齐。**依赖拆分：api 契约先行 → 三 UI 面并发 subagent**
- ⬜ 批 6 项目管理 / 批 7 多端骨架 / 批 8 微交互收尾（含双路径附件）
- ⬜ 批 2/3 reviewer 复审补账（环境已恢复，可并行）
- ⬜ 全部批次完成后：统一真机复验清单交用户
- ⬜ 前序遗留真机清单（待用户）：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012（web build 含批 4；CSS 190883 字节）。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量欠账（不动）：桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；probe-m10-feedback-fixes H 段 3 处 + probe-files-tree-bugs「05e 五项序」——均为已记档基线失败；`.tree`/`.growrow` 死代码；diff L3 位置架构项。

## 易丢的关键上下文

- **批 4 探针定位要点**：PanelTabBar chip = `.ptab`（aria-label 文件/Git/Wiki）；中栏 tab chip = `.tabstrip .tb`；检视器容器 = `[data-desktop-inspector]`；推入态 = `h1.font-mono` + header button hasText 全局文件；FilePreviewPane 锚 = `[data-role="file-preview-pane"]`（无 aria-label）。桌面 /files 初始 = 服务器根真实目录——mock 探针须点 seg4「本项目 · proj1」切作用域后文件行才出现。
- **run-e2e.ts 只吃 `process.argv[2]` 单 spec**——多 spec 逐个跑。
- **诊断脚本必须放项目 scripts/ 内跑**（/tmp 下 import playwright 解析到 bun 缓存全局 1.63 ≠ 项目 1.60，版本冲突崩）。
- **批 3 遗产**（继续有效）：`useImperativeHandle` factory 短路通则；探针 mock 必须给全契约字段；push/面板 fact 字号档刻意不同；`.meta`/`.done` 撞名解撞。
- **探针跑法**：改 web 文件后 `touch web/src/main.tsx` + `sleep 16` + `node scripts/ar-verify-css.mjs`；探针 `bun scripts/*.mjs`；e2e/单测 `systemd-run --scope --user -p MemoryMax=2G`。
- **原型核查方法**：`docs/design/*.html` 原型页同页内联私样式（页私 padding/字号档），与 `assets/components.css` 单源互补——查数值两处都看。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-06；触发原因：v1.5 换代批 4 收口（实施+review 消化+记档，随本批 commit），下一批 = 批 5 历史规模化
