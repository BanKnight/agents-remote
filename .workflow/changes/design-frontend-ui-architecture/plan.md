# plan

## Change 目标

- 收口 `design-frontend-ui-architecture` 的 workflow-local 设计上下文，确保它能作为后续 UI/UX alignment changes 的共享依据。
- 完成后应解锁 `align-ui-shell-foundation`，让后续实现先对齐 shell、路由层级、移动端返回模型和基础视觉语言。

## 局部 big picture

- 本 change 是 `v0.8-prototype-ui-alignment` 的先导 change，不直接修改真实 UI，而是建立后续 changes 的共同设计基线。
- 后续 Home/Project/Agent/Files/Git/Terminal 页面会分别推进，如果没有本 change 先统一来源优先级、三层页面模型、route/workspace 职责和组件边界，页面级实现容易各自发散。
- 本 change 的产物仍属于 workflow 运行态；长期沉淀必须等整轮 prototype alignment 验证后由 distill 阶段完成。

## 执行策略

- 先检查 specs 与 design 是否覆盖所有可验证 requirement：来源优先级、导航层级、route/workspace 层级、组件边界、响应式规则、视觉基线和 distillation 边界。
- 再检查 design 是否能被后续 changes 直接引用：需要包含 UI/UX 规则、frontend route/state/component 边界、风险和开放问题。
- 实现阶段不改 `web/` 代码，只做 artifact 一致性检查和必要的文档修正；如果发现缺口，只更新本 change 的 workflow artifact。
- 验证阶段以文件内容审查为主，确认后续 changes 能从本 change 恢复上下文，不运行浏览器 UI 验证。

## 任务顺序依据

- 先做 artifact 完整性检查，因为它决定是否需要补改 spec/design。
- 再做引用可用性检查，确认后续 changes 是否能按来源优先级和三层页面模型执行。
- 最后更新 tasks 状态和 progress，进入 verify；该 change 不需要代码实现任务，因此不存在编译或浏览器验证阻塞。

## 额外上下文

- `docs/project.md`：确认项目长期定位、前端栈、UI/UX prototype 入口和开发准则。
- `docs/design/prototype/guidelines.md`：作为 prototype alignment 最高优先级规则来源。
- `docs/design/prototype/index.md`：确认 prototype 页面覆盖范围。
- `docs/design/prototype/screenshots/index.md`：确认后续验证截图来源。
- `docs/specs/project-console-navigation/spec.md`：确认既有 Project console WHAT 约束。
- `docs/design/console-shell.md`：确认已验证 console shell 设计约束。
- `docs/design/frontend-stack.md`：确认前端技术栈和状态管理边界。
- `docs/design/mobile-session-interaction.md`：确认 session detail 移动端输入与返回约束。
- `web/src/routes/router.tsx`、`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/state/ui.ts`：用于确认当前真实 UI 路由和组件组织现状。

## 依赖与阻塞

### 阶段依赖

- `specify-change` 已提供 WHAT；`design-change` 已提供 HOW；当前计划只依赖这些 artifact。
- `implement-change` 对本 change 的工作是 workflow artifact 收口，不依赖代码改动。
- `verify-change` 依赖 tasks 全部完成，并确认本 change artifact 能支撑后续 changes。

### 任务依赖

- 1.1 是所有后续任务前置：先确认 artifact 覆盖范围。
- 2.1 依赖 1.1：只有知道覆盖范围后，才能检查下游引用可用性。
- 3.1 依赖 2.1：只有下游引用可用后，才能完成任务状态和 progress 收口。

### 外部依赖

- 无第三方服务、数据迁移、权限、长驻进程或人工确认依赖。
- 不需要启动 dev server；本 change 不改变用户可见 UI。

## 并行机会

- 1.1 与 2.1 不建议并行，因为 2.1 依赖 1.1 对 artifact 完整性的判断。
- 本 change 规模较小，串行执行能减少遗漏和重复修改。

## 风险与验证重点

- 风险：design 写得过抽象，后续 page-level changes 仍无法判断该采用哪种导航/返回/route 层级。
- 风险：误把未验证设计沉淀进长期 docs，违背 workflow 边界。
- 验证重点：spec requirement 在 design 中都有对应设计结论；design 中明确本轮不做事项；下游 changes 可以引用本 change 的来源优先级和三层页面模型。

## 不做事项

- 不修改 `web/`、`api/` 或 `packages/shared/` 代码。
- 不新增依赖、不调整路由实现、不做浏览器截图。
- 不直接更新长期 `docs/`。
- 不开始后续 `align-ui-shell-foundation` 的实现。
