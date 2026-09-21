# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（M9 批次 c 实现完成：探针 15/15 + 回归全绿 + 四门禁过，§6.10 补记已落，**reviewer 三份待跑** → commit。触发：批次 c 收尾）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M9 批次 c（桌面快捷键 + 05f 审批 Popover）实现完成：①快捷键 hook `use-workbench-shortcuts.ts`（⌘N 受控开创建菜单 / ⌘1..9 collectLeaves 切窗格 / ⌘\ 分屏 / ⌘R error 态重连信号，gate = ≥1024 + pointer:fine）②ActionMenu 半受控化 + `workbenchCreateMenuOpenAtom` ③`workbenchReconnectRequestAtom` 信号 atom（SessionDetail 仅 error 态消费即清零）④`ui/popover.tsx` + `approval-popover.tsx`（sbar chip → 05f 紧凑单行 Popover，与移动同数据同逻辑）。探针 `probe-v2-m9-c-shortcuts-approval.mjs` **15/15**；回归全绿（M4 41/M5 26+46/M6 59/M7 68/M8 65/M9a 13/M9b 17×3）；e2e 29/29；四门禁过（api test 一次 flaky 已甄别重跑绿）+CSS 硬闸过。§6.10 批次 c 补记已落。**下一步：reviewer 三份（fork）→ commit → 批次 d。**

## 本 session 焦点

批次 c 全程 + **⌘2 断言红排查（已解，探针 mock 责）**：⌘1 生效 ⌘2 不切换。诊断链：探针补 `-diag` console 监听 → 铁证 `key=2 leaves=1`——⌘1 切走焦点后 prune effect 把 term tab 判 stale 删了。真因：**mock 的 overview candidates 缺 TERM_T_OV**（`useGlobalInstanceRefs` 的 activeIds 源自 overview candidates；真实环境运行中终端必在 overview，分屏 onSplitLeaf 还会 invalidate ["overview"]）→ mock 完备性问题，业务代码零改动。修复 = overview route 动态含新终端。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ §6.10 摊牌（11 条）+ 批次 b 补记（5 条）+ **§6.10 批次 c 落地补记**（本批新增：快捷键六条落地形态——⌘F 挪批次 d/Esc=Radix 内建/⌘N=受控菜单/⌘R=atom 信号消费即清零；05f Popover 与移动同源；探针 mock 铁律再补两条）。
- **探针 mock 铁律（累计三条）**：①形状严格对齐 shared 类型（OverviewCandidate=sessionId/type，AgentSession=id，两套不混用）；②mock 完备覆盖 prune 依赖数据源（overview candidates 含分屏新建终端）；③探针必须隔离真实环境 WS 推送（approvals/stream 不 mock → 真实空快照 setQueryData 覆盖 REST mock → chip 偶发消失——批次 b「复跑绿」偶发的真因，m9b 已补 stream abort）。
- **prune 时序约定（三条路径统一）**：create/resume/split 都 `await navigateWorkbench` 先行再 update layout。
- 桌面 prune 用 globalRefs（overview 聚合），移动用 refs。
- reviewer 用 `subagent_type: "fork"`（继承上下文，M8/M9a/M9b 三批全一次成功）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M7 → M8（`4ae8098`）→ M9 批次 a+b（`4681642`）→ **M9 批次 c（本批，未 commit，等 reviewer）**
- ⏳ reviewer 三份（code/design/perf，fork）待跑 → 通过后 commit 批次 c
- ⬜ **M9 批次 d**（桌面版页面：09m 插件 / 10m 全局文件 ⌘F 接线 / 07m 设置 / 13 pluginmcp_ 开 tab / 桌面预览只读化）→ 批次 e（resolveCreateTarget realpath / searchFiles 上限 / focus-visible 含 seg4 键盘 + aria-controls / w-[52px]）→ 批次末四门禁+commit → M10 总验收（新 e2e 全套 + spec §9 逐项机检 + 用户总验证，Q17 约定）
- **M9 遗留清单**：`.setrow`/`.logout` focus-visible；`.ar` 对比度；`w-[52px]` 真机项；iPad 触屏 hover 正交真机验证（批次 e 静态核对 + 交用户）

## 阻塞 / 风险

- 无阻塞。**基线既有 flaky 甄别记录**：`claude-auto-retry.test.ts`「pending 存在时重复 error 不叠加调度」单跑稳定（22/22）、全量偶发红（一次 exit 1，重跑 814 全绿）——与 web 改动无关，记档不修，后续全量遇红先单跑甄别。
- 大段生成纪律：本批 python 锚点 + index 定界切片稳定（heredoc 内嵌 JS 正则转义仍坑——`\\?` 层级断言失败 1 次，按行号 insert 绕开）；Edit 未用大段（纪律生效）。
- 探针 `.apop` 宽度断言须等 zoom-in 动画结束（waitForTimeout 400）再测，否则 scale 中段 373 vs 378。

## 易丢的关键上下文

- **批次 c 改动文件**（9 源文件 + 2 探针 + 1 文档）：`workbench-model.ts`（+workbenchCreateMenuOpenAtom +workbenchReconnectRequestAtom）、`action-menu.tsx`（半受控 open/onOpenChange）、`instance-area.tsx`（CreateSessionBar 透传 + InstanceLeftOverviewBase 接 atom）、`use-workbench-shortcuts.ts`（新建 hook，挂 WorkbenchRoute onSelectTab 定义**之后**——deps 顺序）、`SessionDetailRoute.tsx`（reconnectRequest 消费 effect）、`WorkbenchRoute.tsx`（挂 hook）、`ui/popover.tsx`（新建，radix-ui monopackage）、`approval-popover.tsx`（新建）、`status-bar.tsx`（chip 包 Popover）、`v2-primitives.css`（.apop/.ahd/.ar1/.abtns）、探针 m9c（新建）+ m9b（补 stream abort）。
- **探针诊断手段**：源码 console.log 加 `-diag` 后缀 + 探针 `page.on("console")` 过滤 `includes("-diag")`（默认只收 error 会漏 log）+ `rg -l "key-diag" web/dist/assets/` 验证 rebuild 生效。
- **dev 服务纪律**：改 web 后 touch main.tsx + `node scripts/ar-verify-css.mjs`；探针 bun 跑；e2e/test 用 `systemd-run --scope --user -p MemoryMax=2G`。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
