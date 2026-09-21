# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（M9 批次 b 实现完成，探针 17/17 + 回归全绿，等 reviewer 三份 → commit。触发：批次 b 收尾）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M9 批次 b（Mac 工作台四件）实现完成：①tabstrip 分屏按钮（GroupHeader icon → onSplitLeaf：POST terminal → await navigate → dropIntoLeaf right）+ SplitGutter grip ⋮⋮ ②状态栏 .sbar 28px（已连接 · N 实例运行中 · 待审批 chip，费用段不做记档）③Inspector 四段（文件/Git/Wiki/历史）④左栏 seg4 mini 作用域「项目/全部」。探针 `probe-v2-m9-b-mac-workbench.mjs` **17/17**；回归全绿（M2 20/M4 41/M5 26+46/M6 59/M7 68/M8 65/M9a 13/e2e 29）；四门禁+CSS 硬闸过（format 修 1 文件）。§6.10 批次 b 补记已落。**reviewer 三份（fork）后台跑中，通过后 commit。下一步批次 c（快捷键 + 05f 审批 Popover）。**

## 本 session 焦点

批次 b 全程 + **分屏树 bug 排查（已解）**：探针「分屏后双窗格」断言红，树塌成 `leaf(全新UUID,[T1])`（A tab 丢）。三层排查：先怀疑 prune 时序（onSplitLeaf 改 await navigate 先行——本身是对的、保留），加源码日志重跑抓到铁证 `activeIds=[]`+`stale=[A]`——**真因是探针 mock 形状错**：overview candidate 用了 `id` 字段，shared `OverviewCandidate` 实为 `sessionId`+`type` → `useGlobalInstanceRefs` 派生 ref.sessionId=undefined → activeIds={undefined} → prune 把非聚焦 tab 全判 stale 删光 → focus effect root-null 分支重建（全新 UUID 铁证）。修法=mock 拆两套形状对象（OV 用 sessionId / S 项目内用 id），业务代码零改动。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ §6.10 摊牌（11 条拍板）+ **§6.10 批次 b 落地补记**（本批新增 5 条：seg4 落左栏 InstanceLeftOverview 顶部非 Sidebar 本体；分屏=分屏并新建终端窗格语义；sbar 费用段不做（OverviewResponse 无费用字段，不伪造）+服务器名无数据源→「已连接」；seg 偏好不持久化；prune 时序教训+mock 形状教训）。
- **探针 mock 铁律（新教训）**：mock 数据必须严格对齐 shared 类型字段名——`OverviewCandidate`=sessionId/type，项目内 `AgentSession`/`TerminalSession`=id，**两套形状不可混用一个对象**（spread 复用也要拆）。已写进 §6.10 补记。
- **prune 时序约定（三条路径统一）**：create/resume/split 都必须 `await navigateWorkbench` 先行再 update layout——prune effect 的 `if (t.sessionId === focusId) continue` 保护依赖 focusId 已切到新 session。
- 桌面 prune 用 globalRefs（overview 聚合，useGlobalInstanceRefs），移动用 refs（项目内查询）——WorkbenchRoute 286 行 `isDesktop ? globalRefs : refs`。
- reviewer 用 `subagent_type: "fork"`（继承上下文，M8/M9 两批全一次成功）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M7 → M8（`4ae8098`）→ M9 批次 a（未 commit）→ **M9 批次 b（本批，未 commit，等 reviewer）**
- ⏳ reviewer 三份（code/design/perf，fork）跑中 → 通过后 commit 批次 a+b（或分两 commit）
- ⬜ **M9 批次 c**（快捷键 ⌘N/⌘1..9/⌘\/⌘F/Esc/⌘R 仅桌面 pointer:fine + 05f 审批 Popover：sbar 待审批 chip 点击弹出）→ 批次 d（09m/10m/07m/13 桌面入口/预览只读化）→ 批次 e（resolveCreateTarget realpath / searchFiles 上限 / focus-visible / w-[52px]）→ 批次末四门禁+commit → M10 总验收（新 e2e 全套 + spec §9 逐项机检 + 用户总验证，Q17 约定）
- **M9 遗留清单**：`.setrow`/`.logout` focus-visible；`.ar` 对比度；`w-[52px]` 真机项；iPad 触屏 hover 正交真机验证（批次 e 静态核对 + 交用户）

## 阻塞 / 风险

- 无阻塞。reviewer 结果未回（后台），回来后按清单处理再 commit。
- 大段生成垃圾行注入仍是高危：本批 Edit 注入零次（python 锚点纪律生效），但 python heredoc 内嵌 JS 正则转义层级（`\\?`）连续 3 次 anchor 断言失败——**改用 index 定界切片替换**（`src.index(起点)`/`src.index(终点)` 之间整段换）绕开转义问题，此法已验证稳定。
- 探针偶发：approvals query fetch 时序曾致「待审批」断言单次红，复跑绿（isDesktop 翻转后 enabled 才 true）；断言消息已带实际值输出便于定位。

## 易丢的关键上下文

- **批次 b 改动文件**（8 源文件 + 1 探针 + 1 文档）：`workbench-model.ts`（WorkbenchInspectionTab 类型 + rightTab 白名单加 history）、`WorkbenchRoute.tsx`（onSplitLeaf ~405 行 + statusBar 挂载 + queryClient invalidate ["projects",key]/["overview"]）、`right-panel-tabs.tsx`（visiblePlugins 数组 filter pages + 内联 history 插件，projectKey gate）、`instance-area.tsx`（InstanceLeftOverviewBase seg4 + candidateToGridItem 导出复用 + GroupHeader onSplit + SplitGutter grip + useGlobalInstanceRefs 已有）、`workbench-shell.tsx`（statusBar prop，main 后渲染）、`status-bar.tsx`（新建）、`icons/split.svg`+`icons/index.tsx`、i18n zh/en（scopeSegmentProject/All、statusBarAria、statusConnected/Connecting、statusInstancesRunning、statusPendingApprovals、splitPane 七 key）、`v2-primitives.css`（.sbar）。
- **探针结构**：mock 双形状（*_OV/*_S）；Part1 桌面 1600（sbar 4 断言 → seg4 4 断言 → Inspector 2 → 分屏 5：先点 Probe Agent A 卡片开窗格再点分屏按钮）、Part2 820 无 sbar；terminal-sessions GET route **动态返回 createdTerminals 数组**（POST 后 GET 忠实含新终端——prune refs 依赖此追上）。
- **调试手段沉淀**：源码临时 console.log（prune-diag/focus-diag）+ 诊断脚本挂 `m.text().includes("-diag")` 过滤器抓 log 级输出（page.on("console") 默认只看 error 会漏）；dist 含日志验证 `rg -l "prune-diag" web/dist/assets/`。
- **dev 服务纪律**：改 web 后 touch main.tsx（新 utility 必须）+ `node scripts/ar-verify-css.mjs`；探针 bun 跑；e2e cgroup 2G。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
