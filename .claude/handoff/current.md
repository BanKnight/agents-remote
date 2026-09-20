# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-21（M3 主页对齐 a–d 全部完成；下一步 M4 工具与深度页。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M3（主页对齐）已完成：M3-a 项目 Tab + M3-b 三行骨架 + M3-c 工作台逐状态 + M3-d 流内容（turn 终态四件套 .count/.done/.stat/.errcard/.cap + .tray）；design-reviewer M3-c 审查「修复后通过」并已全修；探针 23+21+24 全绿；四门禁 + CSS 硬闸 + e2e 29/29。**全部改动未 commit**（M3 一个 commit 待提）。范围裁决与补记已写入 `docs/design/redesign-v2.md` §6.1。下一步 M4 工具与深度页。

## 本 session 焦点

M4：Git/文件/Wiki 三工具原位高亮切换；L3 详情（preview/diff/wiki reader/git history/commit/branches，对标 03m/03o/03p/03q/03r/03s/03t/03u/03v）；03o 移动文件写操作入口；Wiki 注入协议 D13 落地（§7 待定项，M4 摊牌）；L3 preview 形态收敛 file/git 交互。

## 关键决策（本阶段不可丢）

- 全部 23 条决策见 `docs/design/redesign-v2.md` §2（D1–D23），里程碑状态见 §6 + **§6.1 M3 收口补记（本次新增，含范围裁决 5 条）**。
- **「气泡流 → 卡片流」是架构级范式差异，留专项裁决**（§6.1 裁决 1）：工具卡 .card 化 + composer .input 化牵动 tool-ui-registry 30+ 渲染器 / virtualizer 测量 / assistant-ui 集成，开工前需 perf-reviewer + design-reviewer 联审；M3-d 只落地了 bubble 外流级元素（turn 终态四件套 + .tray）。
- M3-c 自动聚焦机制：`effectiveFocusId = focusId ?? autoFocusId`；**focusRef 解析 = `findTabRefLeaf(layout)` 优先 + `renderItems` 注入投影兜底**（design-reviewer #1 修复——回退态 chips/ℹ✕ 靠它恢复）；显式点 pill 才写 layout/URL。
- .count（自动重试倒计时条）无取消/立即重试按钮——服务端无控制端点（用户插话即隐式取消）；若做归 M8 服务端加端点。
- OfflineBanner（navigator.onLine 全局近似）与 session WS 断线呈现（panel 内 .cap + composer 禁用）是两层语义，勿合并。
- v2-primitives.css 新增流终态原语：`.done/.errcard/.count/.cap`（03c/03d/03i 本页样式入单源）；`.tray .w/.c`、`.btn ghost/ok` 直接可用。

## 进度（已完成 / 进行中 / 待办）

- ✅ 沉淀批次 + M0（`b669b57`…）+ M1（`ba8ddca`）+ M2（`2a4d9e1`）
- ✅ **M3 主页对齐（本 session 完成，未 commit）**：
  - M3-a 项目 Tab（`mobile-projects-home.tsx` 新建）：Large title + ➕/⚙ + 搜索 + 活动卡 + 置顶紫标
  - M3-b 三行骨架（`mobile-project-header.tsx` 新建）：nav 行 / row2（ticon ×3 + ＋ + pills）/ chips 运行摘要；删 `mobile-tab-strip.tsx` + `mobile-project-drawer.tsx`（浏览态 grid 一并删）
  - M3-c 逐状态：03h 空态卡 / 自动聚焦（renderItems 注入投影）/ file-git ✕ / OfflineBanner v2 / 03f tmux chip；design-reviewer 审查 6 findings 全修或记档
  - M3-d 流内容：.count（RetryIndicator 迁流顶）+ .done/.stat（TurnStatsFooter）+ .errcard（ApiErrorRow）+ .cap（offlineCap prop）+ .tray（ApprovalTray）；v2-primitives 移植 4 原语；i18n `countTitle/countSchedule/offlineCap`（删孤儿 bannerMulti/bannerSingle）
  - e2e 基线适配 2 处（mobile-nav landing / acp 项目行 exact）
- ⬜ M4 工具与深度页 → M10（总纲 §6 滚动）

## 阻塞 / 风险

- 无阻塞。subagent 通道本 session 恢复（design-reviewer 44 tool uses 跑完 M3-c 审查）。
- **大段 JSX 的 Edit 工具调用多次注入乱码**（本 session 5+ 次：OfflineBanner 三连、EmptyProjectState、探针、ApiErrorRow 两连）——大段替换改用 python 脚本锚点定位整段替换（本轮成功范式）；写完必读回确认。此教训值得沉淀进 `.claude/rules/`（/evolve）。
- 工具卡/composer 形态收敛（气泡流范式）是 M4 开工前要摊牌的专项（§6.1 裁决 1）——M4 若涉及 L3 详情页渲染会碰到，先裁决再动。

## 易丢的关键上下文

- **未 commit 的 M3 改动清单**（`git status` 全量）：M= mobile-workbench / mobile-project-header(new) / mobile-projects-home(new) / WorkbenchRoute / OfflineBanner / icons/index / zh / en / v2-primitives.css / ClaudeSessionDetailRoute / file-browser / pages-panel / project-setup / shell-primitives / instance-area / index.css / e2e 两 spec / probe-ia-skeleton / next-actions.md / handoff / redesign-v2.md；D= mobile-tab-strip / mobile-project-drawer / 两旧探针；??= warning-triangle.svg / book.svg / 3 新探针。**commit 拆分建议**：①M3-a+b（项目 Tab + 骨架 + 删除项）②M3-c+d（逐状态 + 流内容 + reviewer 修复 + e2e 适配）；docs/handoff 随 ②。标准 `git add && git commit`，禁 --only/--git-dir。
- e2e 基线纪律：UI 重构破旧断言当场适配（memory「基线 harness 必须绿」优先）。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。
- 机检 `--strict` 收紧前置：white/black 色阶 + 行尾注释 HEX（当前 report 模式基线 11 处）。
- md 不进 format 门禁（别跑 prettier）；e2e 用 cgroup（`systemd-run --scope --user -p MemoryMax=2G bun run e2e`）；探针 `bun scripts/probe-*.mjs`；改 web 包后必跑 `node scripts/ar-verify-css.mjs`。
- rounded-full computed = `3.35544e+07px`（断言 parseFloat>20）；v2 radius 档 sm8/md10/lg12/xl16(card)/2xl20(sheet)。
- run-e2e.ts 只透传 spec 路径（argv[2]），不支持 -g；失败详情读 `test-results/e2e/playwright-results/*/error-context.md`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
