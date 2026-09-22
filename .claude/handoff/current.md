# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（**M0–M10 全部里程碑完成**：M10 总验收 e2e 29/29 绿 + §9 验收矩阵落盘 + M10 design review 闭环，commit 后**交用户总验证**。触发：M10 收口）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M0–M10 全部完成。M10 总验收：①e2e 三处断言对齐批次 d /files mainPage 化（middle-tab-left ×2 + file-nav ×1，均「左栏 rootBrowse」旧 IA 假设 → main 区定位），全套 **29 passed / 0 failed** ②审批托盘 ⚠ → warning-triangle SVG（emoji 机检唯一原型偏差；✓/✕ 原型自有记档保留）③spec §9 验收矩阵 25 项落盘 redesign-v2.md §6.11 ④M10 design review 0 高 1 中 3 低全闭环（〔中〕W4 矩阵如实化：摘要 chip 静态展示、chip-Popover 未实现属 M3 遗留交用户拍板）。**下一步：交用户总验证（Q17 约定）——真机项 + W4 形态拍板 + 总体验收。**

## 本 session 焦点

M9 批次 d/e commit → M10 总验收全程。e2e 甄别方法论：单跑 `bunx playwright test` baseURL 默认 4173 无服务必挂（9 failed 假象）——**必须走 `bun run scripts/run-e2e.ts <spec>` 透传（自起 seed 环境）**；全套跑失败列表以输出内容为准（exit code 有 tail 管道假象）。file-nav:69「上轮过这轮挂」甄别 = 复跑恒挂 → 同款断言过时一并修正（runner 时序差异不入档）。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ §6.10 摊牌 + §6.11 M10 验收矩阵。
- **W4 形态偏差记档**：spec「运行摘要 chip 点开 = 运行配置 Popover」未实现（chip 静态展示，运行配置切换在会话页 Selector）——M3 遗留非 M10 缺口，是否补交用户总验证定。
- **v2 IA 断言基准**：/files（global + leftMode=files + !focusId）= main 整页 mainPage（GlobalFilesOverview），左栏恒 sidewin 项目总览；点文件后 focusId 生效 mainPage 失效、leftMode 粘性让左栏变回文件树（页面出现第二棵 "Project files"）——e2e 断言追加须重新限定区域。
- reviewer 用 `subagent_type: "fork"`（继承上下文）；M10 design review 一次通过。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M7 → M8（`4ae8098`）→ M9 批次 a+b（`4681642`）→ c（`d59e1ad`）→ d（`2ce3531`）→ e（`579ca24`）→ **M10（本次 commit）**
- ✅ M10：e2e 29/29 + §9 矩阵（redesign-v2.md §6.11）+ emoji 机检收口 + design review 闭环
- ⬜ **交用户总验证**（Q17）：①真机项——`w-[52px]` / ⌘1..9 浏览器抢占 / iPad 触屏 hover 正交 ②W4 是否补 chip-Popover 形态 ③总体验收
- 验证基线：e2e 29 测试全绿；web test 670 / api 816；四门禁 + CSS 硬闸 + token 机检（11 处 v1 遗留 report 零新增）过

## 阻塞 / 风险

- 无阻塞。token 机检 report 模式存活违例仅 SessionDetailRoute.tsx（v1 遗留路由的测试常量表 9 处 HEX），v2 重写面零散落——不属本次范围。
- e2e 甄别教训（本 session 实证）：直跑 playwright 无 seed 环境必假红；全套失败甄别先复跑单 spec 判「恒挂 vs flaky」再定性。

## 易丢的关键上下文

- **M10 commit 文件**（5）：`web/src/routes/ClaudeSessionDetailRoute.tsx`（⚠→SVG ×2）、`e2e/middle-tab-left.spec.ts`（mainRootBrowse helper + 2 测试）、`e2e/file-nav.spec.ts`（getByLabel 全局定位 + 防踩坑注释）、`docs/design/redesign-v2.md`（§6.11 矩阵 + 过程记录 4 条）、`.claude/handoff/current.md`。
- **探针 mock 铁律（四条）**：①形状对齐 shared；②完备覆盖 prune 数据源；③approvals/stream abort；④preview 响应 `name` 字段决定 md/html render 分支。
- **dev 服务纪律**：改 web 后 touch main.tsx + `node scripts/ar-verify-css.mjs`；探针 bun 跑；e2e/test 用 `systemd-run --scope --user -p MemoryMax=2G`；e2e 单 spec 用 run-e2e.ts 透传。
- 用户 Q17 约定已兑现：所有里程碑完成 + 新 e2e 全绿——现在轮到用户验证。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
