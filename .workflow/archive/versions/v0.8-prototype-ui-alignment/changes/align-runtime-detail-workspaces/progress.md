# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`.workflow/versions/index.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-runtime-detail-workspaces
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `.workflow/versions/index.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/specs/runtime-detail-alignment/spec.md
- design：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/design/overview.md；design/ui-ux.md；design/frontend.md；design/risks.md
- plan/tasks：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/plan.md；.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/tasks.md
- implementation：已完成：`tasks.md` 中 1.1、2.1、2.2、2.3、2.4、3.1、3.2、3.3 均已完成；主要实现见 `web/src/routes/SessionDetailRoute.tsx` 与 `web/src/components/shell/shell-primitives.tsx`；artifacts 见本 change `artifacts/`
- verify：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/verify.md；结论为条件通过，无 CRITICAL；Shift+Tab mode/selection 已作为 follow-up gap 登记
- distill：已完成：已增量更新 `docs/design/frontend-ui-architecture.md`、`docs/design/mobile-session-interaction.md` 与 `docs/design/index.md`；`docs/project.md` 已有等价项目级 runtime detail 和调试服务规则，无需更新

## 阶段流转

| 阶段 | 完成标志 |
|---|---|
| 待规格 | `specs/` 已补齐可验证 WHAT |
| 待设计 | `design/` 已补齐 HOW 设计 |
| 待计划 | `plan.md` 与 `tasks.md` 已补齐 |
| 待实现 | `tasks.md` 中实现项已完成 |
| 待验证 | `verify.md` 已补齐一致性证据 |
| 待沉淀 | 长期 docs 已按需沉淀 |
| 已完成 | 可随 version 归档 |
| 阻塞 | 阻塞解除后回到对应阶段 |

## 进展记录

- 2026-05-28：由 `plan-versions` 创建，等待共享基线与 Home/Project shell change 后推进。
- 2026-05-29：依赖 `establish-prototype-alignment-baseline` 与 `align-home-project-shell` 已完成；`specify-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/specs/runtime-detail-alignment/spec.md`，当前阶段推进到待设计。
- 2026-05-29：`design-change` 已创建设计 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`、`design/risks.md`，当前阶段推进到待计划。
- 2026-05-29：`plan-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/plan.md` 与 `tasks.md`，当前阶段推进到待实现。
- 2026-05-29：完成任务 1.1，实现前已加载 `vercel-react-best-practices`、prototype/component/react implementation references，并对照 Agent/Terminal detail 原型、`SessionDetailRoute.tsx` 与 shell primitives 确认共享边界：runtime frame/header、terminal panel、input drawer、quick keys、notice/status/action surface 可收敛；provider-native metadata/history/output、Files/Git 写操作与 runtime 协议变更不可伪造或扩展。
- 2026-05-29：完成任务 2.1，在 `shellSurfaceClasses` 增加 runtime header/body/composer/terminal titlebar roles，并让 Session detail frame、terminal output、input drawer、quick keys、contextual panels 和 notices 继承 shared surface/action/status primitives；`bun run --cwd web typecheck` 通过。
- 2026-05-29：完成任务 2.2，Agent detail 保留顶部返回、真实 provider/session marker、runtime/stream/provider status、Files/Git/+T/Meta contextual tools、真实字段 Meta popover、terminal-first output 与 input drawer；未伪造 provider-native metadata/history/output，`bun run --cwd web typecheck` 通过。
- 2026-05-29：完成任务 2.3，Terminal detail 保持 focused shell：顶部返回、Terminal marker、displayName、runtime/stream status、Reconnect/Resize/Close 与 terminal output/input drawer 可见；Terminal 分支不显示 Files/Git/+Terminal/Meta/provider pill 或 provider metadata，close/reconnect/runtime lifecycle 未改动；`bun run --cwd web typecheck` 通过。
- 2026-05-29：完成任务 2.4，移动端 runtime detail 未渲染 Project 二级 bottom navigation，input drawer 作为三段式 grid 底部布局参与高度计算并保留 safe-area padding；collapsed 不清空 input 或关闭 stream，quick keys disabled 时不发送且使用真实 sequence；`bun run --cwd web typecheck && bun test web/src/routes/console-model.test.ts` 通过。
- 2026-05-29：完成任务 3.1，`bun run --cwd web typecheck`、`bun run --cwd web test`、`git diff --check` 均通过；未发现需修复的问题。
- 2026-05-29：完成任务 3.2，使用固定 tmux `ar-dev`（API 43011、Web 43012、`PROJECTS_ROOT=/home/deploy/workspace`）采集 Agent/Terminal detail prototype/app desktop/mobile screenshots、desktop/mobile browser check JSON 和 `artifacts/browser-check.log`；真实 Terminal fixture 已在截图后关闭，未伪造 runtime 数据。
- 2026-05-29：完成任务 3.3，回写 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 中 `GAP-20260529-runtime-shift-tab-mode`，记录原型 Shift+Tab mode/selection quick key 不是当前真实能力；`tasks.md` 全部任务已完成，implementation 标记已完成，当前阶段推进到待验证。
- 2026-05-29：`verify-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/verify.md`；`bun run --cwd web typecheck`、`bun run --cwd web test`、`bun test web/src/routes/console-model.test.ts`、`git diff --check` 与 browser artifacts 均通过/可审查；无 CRITICAL，当前阶段推进到待沉淀。
- 2026-05-29：`distill-change` 已将验证后的 runtime detail surface roles、mobile input drawer/quick key 真实能力边界和证据来源增量沉淀到 `docs/design/frontend-ui-architecture.md`、`docs/design/mobile-session-interaction.md` 与 `docs/design/index.md`；`docs/project.md` 已有等价项目级认知无需更新，当前阶段推进到已完成。
