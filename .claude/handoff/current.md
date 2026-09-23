# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-23（**第十轮 6 批次全部闭环**。移动底部导航恒显 + 多端整体对齐设计包批次 1-6 全 commit：`79e68e7`/`052feda`/`848a04a`/`bf31c1b`/`1c99f26`/`42d2e10`，§6.12j 记档。继续等用户真机复验报数）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十轮两问题（①移动底部 nav 恒显 ②多端整体对齐）6 批次全闭环：批次 1 移动 nav 通栏恒显、批次 2 桌面 tabstrip+检视 seg4、批次 3 检视 IA 收敛（左栏只留实例/历史/插件）、批次 4 桌面市场可达+09m/10m 重排、批次 5 05g「全部」分组列表+aprow 审批橙行+侧栏 250/260 分档、批次 6 文件菜单 05e 五项。**下一步：交用户真机复验清单。**

## 本 session 焦点

批次 5 验证收尾 + 批次 6 实现。批次 5 验证期揪出并修了三个实质问题：①i18n 插值语法（`{{count}}` 双花括号，误写单花括号致模板原样输出）；②05g「全部」跨项目行导航错乱（focusInstance 的 scope.key 捷径把 proj2 行构造成 /projects/proj1/session/<proj2-id>——改为 AllSessionsGroupedList 组件内导航，行自身 candidate.ref 构造 URL + sticky search 透传，移动端 focusInstance(candidate) 同款先例）；③排除「approvals 非空即崩」假 bug（实为 dist JS 半更新态，同代码稳定 dist 复跑即过）。

## 关键决策（本阶段不可丢）

- **i18n 插值语法 = `{{count}}` 双花括号**（translate.ts 实现，home.nRunning 先例）——新 key 忘写双括号不会报错，只原样输出模板，探针文本断言才能拦住。
- **dist JS 半更新态（新教训，已记 §6.12j）**：CSS 落盘硬闸 ≠ JS chunk 落盘稳定。vite build --watch 增量改多 chunk 时中途跑探针会载到新旧混合 chunk——症状 = ErrorBoundary "Something went wrong" + asides=0，极易误导向 mock 二分歧路（本次误导向「approvals 非空即崩」耗费数轮）。**跑探针前 touch main.tsx 完整 rebuild + 等 16s**。
- **useGlobalInstanceCandidates 的 scope gate**：非 global scope 恒返回空数组（project scope 零开销设计）——project scope 下「全部」类跨项目列表不能依赖调用链上的 candidates 反查，组件内用行自身 ref 导航（AllSessionsGroupedList 模式）。
- **rg 严禁 `-rn`**（`-r` 是 replace 标志会篡改输出）——本 session 误用两次，输出侥幸无损伤；一律 `-n`。
- **Edit 工具乱码注入本 session 第 5 次**（WorkbenchRoute 回滚时 old_string 损坏未写入）——≥15 行/易乱码改动坚持 python 锚点脚本 + 写完 rg 机检；Edit 限单行小步。
- 05e 文件菜单五项原文序：打开预览（file 图标）/重命名/移动到…/上传文件…（plus，onUploadClick）/删除；目录行无预览项；rootBrowse 根层 isRootListing 只读无 ⋯（readOnly 口径）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 + 十轮反馈修复；第十轮批次 1-6 全闭环（§6.12j 逐批记档）
- ✅ 探针：m9-d 62/62（批次 5 +G1-G16）、probe-files-tree-bugs ALL PASS（IA 适配 + 菜单断言）、m11/m6/m10 均绿；e2e 27/27；四门禁全绿
- ⬜ **交用户真机复验**，第十轮清单：
  - **iPhone**：底部 nav 各场景恒显（工作台 project scope/聚焦态/L3 深度页）+ 通栏形态；键盘弹出盖 nav 属预期
  - **桌面**：tabstrip 形制（32px/下划线/状态点/条上＋）、检视 seg4「检视 · 只读」、左栏只留实例/历史/插件、市场页 /plugins/market 直达、插件 09m 单页三段、文件 10m seg4+⌘F、05g「全部」分组列表（置顶/项目分组/空组）、aprow 审批橙行点击开审批中心、Mac 250px 侧栏
  - **iPad（≥1024）**：侧栏 260px 分档、05g seg4、aprow 橙行、文件菜单（长按）
  - 遗留（历史轮）：②时间刷新节奏、⑥gf 卡形态、⑫浮层穿透、⑬ticon 间距、iPad 触屏 hover 正交、W4 chip-Popover 形态
  - 记档不做：宽屏中栏 360px（回归面大收益低）、数据依赖 D 批（sbar 今日 $/Codex 创建行/MCP live 徽章）

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已 rebuild（CSS 硬闸 + content-type text/css 均过）。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`（bun 不用 node）+ systemd-run 2G；跑前 touch main.tsx 完整 rebuild（本 session 新教训）。
- **探针 mock 铁律**：route 正则带查询尾 `(?:\?.*)?$`；overview/subtitles/approvals/stream 都要 mock 隔离（真实环境数据穿透会污染桌面 sidewin 相关断言——probe-files-tree-bugs 实锤）。
- **tint 类 token**：dist minify 转写 8 位 hex（#ff9f0a1f），探针断言做 hex8↔rgba 换算（alpha 31/255≈0.12 需 toFixed(2)）。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 16 → ar-verify-css；交付前 curl content-type 必须 text/css。
- contains 防护 idiom：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
